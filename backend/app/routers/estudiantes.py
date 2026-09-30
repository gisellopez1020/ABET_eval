import csv
import io
import re
from typing import List, Optional, Tuple
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response, UploadFile, File, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import Seccion, Estudiante, Curso
from app.schemas import EstudianteCreate, EstudianteListadoOut, EstudianteOut, ImportacionCSVResultado
from app.schemas.estudiante import VistaPreviaEstudiantes
from app.services.exportar_estudiantes import (
    FilaEstudiante, libro_estudiantes, nombre_archivo_estudiantes,
)
from app.services.notas import promedios_estudiantes

try:
    import pandas as pd
except ImportError:  # misma dependencia opcional que utils/excel_parser.py
    pd = None

MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

# (número de fila en el archivo, nombre crudo, código crudo, correo crudo)
FilaCruda = Tuple[int, Optional[str], Optional[str], Optional[str]]
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


def _es_excel(archivo: UploadFile) -> bool:
    return (archivo.filename or "").lower().endswith(".xlsx") or archivo.content_type == MIME_XLSX


async def _leer_filas(archivo: UploadFile) -> List[FilaCruda]:
    contenido = await archivo.read()
    if _es_excel(archivo):
        return _leer_filas_excel(contenido)
    return _leer_filas_csv(contenido)


def _columnas(campos: List[str]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    col_nombre = next((c for c in campos if "nombre" in c.lower()), None)
    col_codigo = next((c for c in campos if "codigo" in c.lower() or "código" in c.lower()), None)
    # Opcional: sin esta columna el correo queda NULL
    col_email = next(
        (c for c in campos if any(k in c.lower() for k in ("email", "e-mail", "correo"))), None
    )
    return col_nombre, col_codigo, col_email


def _leer_filas_csv(contenido: bytes) -> List[FilaCruda]:
    try:
        texto = contenido.decode("utf-8-sig")  # utf-8-sig maneja BOM de Excel
    except UnicodeDecodeError:
        texto = contenido.decode("latin-1")

    lector = csv.DictReader(io.StringIO(texto))
    col_nombre, col_codigo, col_email = _columnas(lector.fieldnames or [])

    if not col_nombre or not col_codigo:
        raise HTTPException(
            status_code=422,
            detail="El CSV debe tener columnas 'Nombre' y 'Codigo' (o 'Código')",
        )

    return [
        (i, fila.get(col_nombre), fila.get(col_codigo), fila.get(col_email) if col_email else None)
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
    col_nombre, col_codigo, col_email = _columnas(list(df.columns))

    if not col_nombre or not col_codigo:
        raise HTTPException(
            status_code=422,
            detail="El Excel debe tener columnas 'Nombre' y 'Codigo' (o 'Código')",
        )

    emails = df[col_email] if col_email else [None] * len(df)
    return [
        (i, nombre, codigo, email)
        for i, (nombre, codigo, email) in enumerate(zip(df[col_nombre], df[col_codigo], emails), start=2)
    ]


def _procesar_filas(filas: List[FilaCruda]) -> Tuple[List[EstudianteValido], List[str]]:
    """
    Normaliza las filas y separa las válidas (nombre, código, correo) de los errores.
    Un correo que no lo parece no descarta la fila: el estudiante se importa con el
    correo en blanco y queda un aviso.
    """
    validos: List[EstudianteValido] = []
    errores: List[str] = []

    for i, nombre_crudo, codigo_crudo, email_crudo in filas:
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
    response_model=EstudianteOut,
    status_code=status.HTTP_201_CREATED,
    summary="Agregar estudiante manualmente",
)
def agregar_estudiante(
    seccion_id: int,
    body: EstudianteCreate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Agrega un único estudiante a la sección."""
    _verificar_seccion(seccion_id, usuario["email"], db)
    estudiante = Estudiante(
        nombre_completo=body.nombre_completo.strip().upper(),
        codigo_estudiante=body.codigo_estudiante.strip(),
        seccion_id=seccion_id,
    )
    db.add(estudiante)
    db.commit()
    db.refresh(estudiante)
    return estudiante


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
    También acepta un .xlsx con las mismas dos columnas en la primera hoja
    (se detecta por la extensión o el content_type).
    """
    _verificar_seccion(seccion_id, usuario["email"], db)

    validos, errores = _procesar_filas(await _leer_filas(archivo))
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
    _verificar_seccion(seccion_id, usuario["email"], db)
    validos, errores = _procesar_filas(await _leer_filas(archivo))
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
