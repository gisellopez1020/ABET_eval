import csv
import io
import re
import unicodedata
from collections import Counter
from typing import List, NamedTuple, Optional, Tuple
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response, UploadFile, File, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import Seccion, Estudiante, Curso
from app.schemas import EstudianteCreate, EstudianteListadoOut, EstudianteOut, ImportacionCSVResultado
from app.schemas.estudiante import EstudianteCreado, EstudianteUpdate, VistaPreviaEstudiantes
from app.services.exportar_estudiantes import (
    FilaEstudiante, libro_estudiantes, nombre_archivo_estudiantes,
)
from app.services.notas import promedios_estudiantes

try:
    import pandas as pd
except ImportError:  # misma dependencia opcional que utils/excel_parser.py
    pd = None

MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

# (número de fila en el archivo, nombre completo crudo, código crudo, correo crudo, grupo crudo).
# El nombre ya llega combinado con los apellidos si el archivo los trae en otra columna
FilaCruda = Tuple[int, Optional[str], Optional[str], Optional[str], Optional[str]]
# (nombre, código, correo o None)
EstudianteValido = Tuple[str, str, Optional[str]]

# Chequeo mínimo: algo@algo.algo sin espacios. No se corrige ni se completa el dato
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

router = APIRouter(tags=["Estudiantes"])


def _verificar_seccion(seccion_id: int, email: str, db: Session) -> Seccion:
    seccion = db.get(Seccion, seccion_id)
    if not seccion:
        raise HTTPException(status_code=404, detail="Sección no encontrada")
    curso = db.get(Curso, seccion.curso_id)
    if not curso or curso.docente_email != email:
        raise HTTPException(status_code=403, detail="No tiene permiso sobre esta sección")
    return seccion


def _normalizar_email(crudo: Optional[str]) -> Tuple[Optional[str], bool]:
    """
    (correo, era_invalido) para el alta manual, con el criterio de la importación:
    recortado y en minúsculas, vacío -> None, y uno que no lo parece se deja en blanco
    (nunca se rechaza al estudiante por el formato ni se corrige el dato).
    """
    email = (crudo or "").strip().lower() or None
    if email and not _EMAIL_RE.match(email):
        return None, True
    return email, False


def _es_excel(archivo: UploadFile) -> bool:
    return (archivo.filename or "").lower().endswith(".xlsx") or archivo.content_type == MIME_XLSX


async def _leer_filas(archivo: UploadFile) -> List[FilaCruda]:
    contenido = await archivo.read()
    if _es_excel(archivo):
        return _leer_filas_excel(contenido)
    return _leer_filas_csv(contenido)


class Columnas(NamedTuple):
    nombre: Optional[str]
    codigo: Optional[str]
    email: Optional[str] = None
    apellidos: Optional[str] = None
    grupo: Optional[str] = None


def _clave(encabezado: str) -> str:
    """Encabezado comparable: minúsculas, sin tildes y sin espacios de más."""
    sin_tildes = unicodedata.normalize("NFKD", encabezado).encode("ascii", "ignore").decode()
    return " ".join(sin_tildes.lower().split())


# Formato de la lista institucional: Nombre | Apellido(s) | Número de ID | Dirección de correo | Grupo.
# Se compara el encabezado entero: buscar "id" como fragmento también encontraría "Apellido(s)"
_ALIAS_CODIGO = {"numero de id", "id"}


def _columnas(campos: List[str]) -> Columnas:
    col_nombre = next((c for c in campos if "nombre" in c.lower()), None)
    col_codigo = next((c for c in campos if "codigo" in c.lower() or "código" in c.lower()), None)
    if col_codigo is None:
        col_codigo = next((c for c in campos if _clave(c) in _ALIAS_CODIGO), None)
    # Opcional: sin esta columna el correo queda NULL ("Dirección de correo" entra por "correo")
    col_email = next(
        (c for c in campos if any(k in c.lower() for k in ("email", "e-mail", "correo"))), None
    )
    # Opcionales: apellidos en columna aparte (se unen al nombre) y grupo (solo para avisar)
    col_apellidos = next((c for c in campos if _clave(c).startswith("apellido")), None)
    col_grupo = next((c for c in campos if _clave(c) == "grupo"), None)
    return Columnas(col_nombre, col_codigo, col_email, col_apellidos, col_grupo)


def _nombre_completo(nombre: Optional[str], apellidos: Optional[str]) -> str:
    """Une Nombre y Apellido(s) cuando vienen separados; sin apellidos, el nombre ya es el completo."""
    return f"{(nombre or '').strip()} {(apellidos or '').strip()}".strip()


def _leer_filas_csv(contenido: bytes) -> List[FilaCruda]:
    try:
        texto = contenido.decode("utf-8-sig")  # utf-8-sig maneja BOM de Excel
    except UnicodeDecodeError:
        texto = contenido.decode("latin-1")

    lector = csv.DictReader(io.StringIO(texto))
    cols = _columnas(lector.fieldnames or [])

    if not cols.nombre or not cols.codigo:
        raise HTTPException(
            status_code=422,
            detail="El CSV debe tener columnas 'Nombre' y 'Codigo' (o 'Código', o 'Número de ID')",
        )

    return [
        (
            i,
            _nombre_completo(fila.get(cols.nombre), fila.get(cols.apellidos) if cols.apellidos else None),
            fila.get(cols.codigo),
            fila.get(cols.email) if cols.email else None,
            fila.get(cols.grupo) if cols.grupo else None,
        )
        for i, fila in enumerate(lector, start=2)
    ]


def _leer_filas_excel(contenido: bytes) -> List[FilaCruda]:
    if pd is None:
        raise HTTPException(status_code=422, detail="pandas y openpyxl son necesarios para leer Excel")
    try:
        # dtype=str: un código como 2021001 no debe llegar como 2021001.0;
        # keep_default_na=False: las celdas vacías llegan como "" y no como NaN
        df = pd.read_excel(io.BytesIO(contenido), header=0, dtype=str, keep_default_na=False)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"No se pudo leer el archivo Excel: {exc}")

    df.columns = [str(c) for c in df.columns]
    cols = _columnas(list(df.columns))

    if not cols.nombre or not cols.codigo:
        raise HTTPException(
            status_code=422,
            detail="El Excel debe tener columnas 'Nombre' y 'Codigo' (o 'Código', o 'Número de ID')",
        )

    def columna(nombre_col: Optional[str]):
        return df[nombre_col] if nombre_col else [None] * len(df)

    return [
        (i, _nombre_completo(nombre, apellidos), codigo, email, grupo)
        for i, (nombre, apellidos, codigo, email, grupo) in enumerate(
            zip(df[cols.nombre], columna(cols.apellidos), df[cols.codigo], columna(cols.email), columna(cols.grupo)),
            start=2,
        )
    ]


def _procesar_filas(
    filas: List[FilaCruda], seccion_nombre: Optional[str] = None
) -> Tuple[List[EstudianteValido], List[str]]:
    """
    Normaliza las filas y separa las válidas (nombre, código, correo) de los errores.
    Un correo que no lo parece no descarta la fila: el estudiante se importa con el
    correo en blanco y queda un aviso.
    La columna Grupo no se guarda (la sección la define la URL): si se pasa
    seccion_nombre, solo se avisa cuando no coincide, una vez por valor distinto.
    """
    validos: List[EstudianteValido] = []
    errores: List[str] = []
    otros_grupos: Counter = Counter()

    for i, nombre_crudo, codigo_crudo, email_crudo, grupo_crudo in filas:
        nombre = (nombre_crudo or "").strip().upper()
        codigo = (codigo_crudo or "").strip()
        if not nombre or not codigo:
            errores.append(f"Fila {i}: nombre o código vacío, se omite")
            continue
        email = (email_crudo or "").strip().lower() or None
        if email and not _EMAIL_RE.match(email):
            errores.append(f"Fila {i}: correo '{email_crudo.strip()}' no válido, se deja en blanco")
            email = None
        validos.append((nombre, codigo, email))
        grupo = (grupo_crudo or "").strip()
        if seccion_nombre is not None and grupo and _clave(grupo) != _clave(seccion_nombre):
            otros_grupos[grupo] += 1

    for grupo, n in otros_grupos.items():
        errores.append(
            f"{n} fila{'s tienen' if n != 1 else ' tiene'} Grupo '{grupo}', distinto de esta "
            f"sección ('{seccion_nombre}'); se importa{'n' if n != 1 else ''} igual"
        )

    return validos, errores


@router.get(
    "/secciones/{seccion_id}/estudiantes",
    response_model=List[EstudianteListadoOut],
    summary="Listar estudiantes de una sección",
)
def listar_estudiantes(
    seccion_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Devuelve todos los estudiantes matriculados en la sección, con su promedio
    ponderado sobre las actividades calificadas del curso (ver services/notas.py).
    """
    seccion = _verificar_seccion(seccion_id, usuario["email"], db)
    estudiantes = (
        db.query(Estudiante)
        .filter(Estudiante.seccion_id == seccion_id)
        .order_by(Estudiante.nombre_completo)
        .all()
    )
    promedios = promedios_estudiantes(db, seccion.curso_id, [e.id for e in estudiantes])
    return [
        EstudianteListadoOut(
            **EstudianteOut.model_validate(e).model_dump(),
            promedio=float(promedios[e.id]) if promedios[e.id] is not None else None,
        )
        for e in estudiantes
    ]


@router.post(
    "/secciones/{seccion_id}/estudiantes",
    response_model=EstudianteCreado,
    status_code=status.HTTP_201_CREATED,
    summary="Agregar estudiante manualmente",
)
def agregar_estudiante(
    seccion_id: int,
    body: EstudianteCreate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Agrega un único estudiante a la sección. El correo es opcional; si no tiene
    formato de correo el estudiante se crea igual, con el correo en blanco y un `aviso`.
    """
    _verificar_seccion(seccion_id, usuario["email"], db)
    email, email_invalido = _normalizar_email(body.email)
    estudiante = Estudiante(
        nombre_completo=body.nombre_completo.strip().upper(),
        codigo_estudiante=body.codigo_estudiante.strip(),
        email=email,
        seccion_id=seccion_id,
    )
    db.add(estudiante)
    db.commit()
    db.refresh(estudiante)
    return EstudianteCreado(
        **EstudianteOut.model_validate(estudiante).model_dump(),
        aviso=f"El correo '{body.email.strip()}' no es válido, se dejó en blanco" if email_invalido else None,
    )


@router.post(
    "/secciones/{seccion_id}/estudiantes/csv",
    response_model=ImportacionCSVResultado,
    status_code=status.HTTP_201_CREATED,
    summary="Importar estudiantes desde CSV o Excel",
)
async def importar_csv(
    seccion_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Importa estudiantes desde un archivo CSV con formato:
    Nombre,Codigo[,Email]
    OSCAR EVELIO PRADA CEBALLOS,2021001

    La columna Email (o Correo) es opcional; sin ella el correo queda en blanco.
    También acepta el formato de la lista institucional (el mismo que exporta la app):
    Nombre | Apellido(s) | Número de ID | Dirección de correo | Grupo. Nombre y
    Apellido(s) se unen en el nombre completo; Grupo no se guarda (la sección es la
    de la URL) y solo genera un aviso si no coincide con ella.
    También acepta un .xlsx con las mismas dos columnas en la primera hoja
    (se detecta por la extensión o el content_type).
    """
    seccion = _verificar_seccion(seccion_id, usuario["email"], db)

    validos, errores = _procesar_filas(await _leer_filas(archivo), seccion.nombre)
    for nombre, codigo, email in validos:
        db.add(Estudiante(
            nombre_completo=nombre,
            codigo_estudiante=codigo,
            email=email,
            seccion_id=seccion_id,
        ))

    db.commit()
    return ImportacionCSVResultado(importados=len(validos), errores=errores)


@router.post(
    "/secciones/{seccion_id}/estudiantes/vista-previa",
    response_model=VistaPreviaEstudiantes,
    summary="Leer estudiantes de un CSV o Excel sin importarlos",
)
async def vista_previa_estudiantes(
    seccion_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Devuelve los estudiantes que importaría POST .../estudiantes/csv con el mismo
    archivo, sin guardarlos. El frontend la usa para la vista previa de un .xlsx
    (la de un CSV se sigue calculando en el navegador).
    """
    seccion = _verificar_seccion(seccion_id, usuario["email"], db)
    validos, errores = _procesar_filas(await _leer_filas(archivo), seccion.nombre)
    return VistaPreviaEstudiantes(
        estudiantes=[{"nombre": n, "codigo": c, "email": e} for n, c, e in validos],
        errores=errores,
    )


@router.get(
    "/estudiantes/exportar-excel",
    response_class=Response,
    summary="Exportar la lista de estudiantes a Excel",
)
def exportar_excel(
    curso_id: Optional[int] = Query(default=None),
    seccion_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    .xlsx con Nombre | Apellido(s) | Número de ID | Dirección de correo | Grupo, y una
    columna Asignatura si las filas vienen de más de una. Sin filtros exporta a los
    estudiantes de todas las asignaturas del docente (secciones activas, como la
    pantalla Estudiantes); con curso_id y/o seccion_id, solo esos. Una sección pedida
    explícitamente se exporta aunque esté archivada.
    El correo sale del campo email: en blanco si no se importó, nunca calculado.
    """
    email = usuario["email"]
    curso = None
    if curso_id is not None:
        curso = db.get(Curso, curso_id)
        if not curso:
            raise HTTPException(status_code=404, detail="Asignatura no encontrada")
        if curso.docente_email != email:
            raise HTTPException(status_code=403, detail="No tiene permiso sobre esta asignatura")
    seccion = None
    if seccion_id is not None:
        seccion = _verificar_seccion(seccion_id, email, db)
        if curso is not None and seccion.curso_id != curso.id:
            raise HTTPException(status_code=404, detail="Sección no encontrada en esta asignatura")

    query = (
        db.query(Estudiante, Seccion, Curso)
        .join(Seccion, Estudiante.seccion_id == Seccion.id)
        .join(Curso, Seccion.curso_id == Curso.id)
        .filter(Curso.docente_email == email)
    )
    if seccion is not None:
        query = query.filter(Seccion.id == seccion.id)
    else:
        query = query.filter(Seccion.activo == True)  # noqa: E712
        if curso is not None:
            query = query.filter(Curso.id == curso.id)
    filas = [
        FilaEstudiante(
            nombre_completo=est.nombre_completo,
            codigo=est.codigo_estudiante,
            email=est.email,
            grupo=sec.nombre,
            asignatura=f"{cur.nombre} ({cur.codigo} · {cur.periodo})",
        )
        for est, sec, cur in query.order_by(Curso.nombre, Seccion.nombre, Estudiante.nombre_completo).all()
    ]

    # El archivo lleva el código de la asignatura y la sección solo si se filtró por ellas
    curso_archivo = curso or (db.get(Curso, seccion.curso_id) if seccion else None)
    nombre = nombre_archivo_estudiantes(
        [*([curso_archivo.codigo] if curso_archivo else []), *([seccion.nombre] if seccion else [])]
    )
    ascii_ = nombre.encode("ascii", "ignore").decode() or "Estudiantes.xlsx"
    return Response(
        content=libro_estudiantes(filas),
        media_type=MIME_XLSX,
        headers={"Content-Disposition": f"attachment; filename=\"{ascii_}\"; filename*=UTF-8''{quote(nombre)}"},
    )


@router.put(
    "/estudiantes/{estudiante_id}",
    response_model=EstudianteCreado,
    summary="Editar estudiante",
)
def editar_estudiante(
    estudiante_id: int,
    body: EstudianteUpdate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Edita nombre, código y/o correo; solo cambia los campos enviados. No toca la
    sección, los equipos ni las calificaciones del estudiante.
    El correo se normaliza como en el alta (`null` o vacío lo borra). Uno sin formato
    de correo no bloquea la edición: se conserva el que había (en blanco si no había)
    y la respuesta trae un `aviso`.
    """
    estudiante = db.get(Estudiante, estudiante_id)
    if not estudiante:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado")
    seccion = db.get(Seccion, estudiante.seccion_id)
    curso = db.get(Curso, seccion.curso_id)
    if not curso or curso.docente_email != usuario["email"]:
        raise HTTPException(status_code=403, detail="No tiene permiso para editar este estudiante")

    enviados = body.model_fields_set
    if "nombre_completo" in enviados:
        estudiante.nombre_completo = body.nombre_completo.upper()
    if "codigo_estudiante" in enviados:
        estudiante.codigo_estudiante = body.codigo_estudiante

    aviso = None
    if "email" in enviados:
        email, email_invalido = _normalizar_email(body.email)
        if email_invalido:
            # Un error de tipeo no debe borrar un correo bueno que ya estaba
            aviso = f"El correo '{body.email.strip()}' no es válido, " + (
                "se conservó el anterior" if estudiante.email else "se dejó en blanco"
            )
        else:
            estudiante.email = email

    db.commit()
    db.refresh(estudiante)
    return EstudianteCreado(**EstudianteOut.model_validate(estudiante).model_dump(), aviso=aviso)


@router.delete(
    "/estudiantes/{estudiante_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar estudiante",
)
def eliminar_estudiante(
    estudiante_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Elimina un estudiante. También elimina sus calificaciones individuales."""
    estudiante = db.get(Estudiante, estudiante_id)
    if not estudiante:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado")
    seccion = db.get(Seccion, estudiante.seccion_id)
    curso = db.get(Curso, seccion.curso_id)
    if not curso or curso.docente_email != usuario["email"]:
        raise HTTPException(status_code=403, detail="No tiene permiso para eliminar este estudiante")

    db.delete(estudiante)
    db.commit()
