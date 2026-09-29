import csv
import io
from typing import List, Optional, Tuple
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import Seccion, Estudiante, Curso
from app.schemas import EstudianteCreate, EstudianteListadoOut, EstudianteOut, ImportacionCSVResultado
from app.schemas.estudiante import VistaPreviaEstudiantes
from app.services.notas import promedios_estudiantes

try:
    import pandas as pd
except ImportError:  # misma dependencia opcional que utils/excel_parser.py
    pd = None

MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

# (número de fila en el archivo, nombre crudo, código crudo)
FilaCruda = Tuple[int, Optional[str], Optional[str]]

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


def _columnas(campos: List[str]) -> Tuple[Optional[str], Optional[str]]:
    col_nombre = next((c for c in campos if "nombre" in c.lower()), None)
    col_codigo = next((c for c in campos if "codigo" in c.lower() or "código" in c.lower()), None)
    return col_nombre, col_codigo


def _leer_filas_csv(contenido: bytes) -> List[FilaCruda]:
    try:
        texto = contenido.decode("utf-8-sig")  # utf-8-sig maneja BOM de Excel
    except UnicodeDecodeError:
        texto = contenido.decode("latin-1")

    lector = csv.DictReader(io.StringIO(texto))
    col_nombre, col_codigo = _columnas(lector.fieldnames or [])

    if not col_nombre or not col_codigo:
        raise HTTPException(
            status_code=422,
            detail="El CSV debe tener columnas 'Nombre' y 'Codigo' (o 'Código')",
        )

    return [
        (i, fila.get(col_nombre), fila.get(col_codigo))
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
    col_nombre, col_codigo = _columnas(list(df.columns))

    if not col_nombre or not col_codigo:
        raise HTTPException(
            status_code=422,
            detail="El Excel debe tener columnas 'Nombre' y 'Codigo' (o 'Código')",
        )

    return [
        (i, nombre, codigo)
        for i, (nombre, codigo) in enumerate(zip(df[col_nombre], df[col_codigo]), start=2)
    ]


def _procesar_filas(filas: List[FilaCruda]) -> Tuple[List[Tuple[str, str]], List[str]]:
    """Normaliza las filas y separa las válidas (nombre, código) de los errores."""
    validos: List[Tuple[str, str]] = []
    errores: List[str] = []

    for i, nombre_crudo, codigo_crudo in filas:
        nombre = (nombre_crudo or "").strip().upper()
        codigo = (codigo_crudo or "").strip()
        if not nombre or not codigo:
            errores.append(f"Fila {i}: nombre o código vacío, se omite")
            continue
        validos.append((nombre, codigo))

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
    Nombre,Codigo
    OSCAR EVELIO PRADA CEBALLOS,2021001

    También acepta un .xlsx con las mismas dos columnas en la primera hoja
    (se detecta por la extensión o el content_type).
    """
    _verificar_seccion(seccion_id, usuario["email"], db)

    validos, errores = _procesar_filas(await _leer_filas(archivo))
    for nombre, codigo in validos:
        db.add(Estudiante(
            nombre_completo=nombre,
            codigo_estudiante=codigo,
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
        estudiantes=[{"nombre": n, "codigo": c} for n, c in validos],
        errores=errores,
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
