import csv
import io
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import Seccion, Estudiante, Curso
from app.schemas import EstudianteCreate, EstudianteOut, ImportacionCSVResultado

router = APIRouter(tags=["Estudiantes"])


def _verificar_seccion(seccion_id: int, email: str, db: Session) -> Seccion:
    seccion = db.get(Seccion, seccion_id)
    if not seccion:
        raise HTTPException(status_code=404, detail="Sección no encontrada")
    curso = db.get(Curso, seccion.curso_id)
    if not curso or curso.docente_email != email:
        raise HTTPException(status_code=403, detail="No tiene permiso sobre esta sección")
    return seccion


@router.get(
    "/secciones/{seccion_id}/estudiantes",
    response_model=List[EstudianteOut],
    summary="Listar estudiantes de una sección",
)
def listar_estudiantes(
    seccion_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Devuelve todos los estudiantes matriculados en la sección."""
    _verificar_seccion(seccion_id, usuario["email"], db)
    return (
        db.query(Estudiante)
        .filter(Estudiante.seccion_id == seccion_id)
        .order_by(Estudiante.nombre_completo)
        .all()
    )


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
    summary="Importar estudiantes desde CSV",
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
    """
    _verificar_seccion(seccion_id, usuario["email"], db)

    contenido = await archivo.read()
    try:
        texto = contenido.decode("utf-8-sig")  # utf-8-sig maneja BOM de Excel
    except UnicodeDecodeError:
        texto = contenido.decode("latin-1")

    lector = csv.DictReader(io.StringIO(texto))
    campos = lector.fieldnames or []
    col_nombre = next((c for c in campos if "nombre" in c.lower()), None)
    col_codigo = next((c for c in campos if "codigo" in c.lower() or "código" in c.lower()), None)

    if not col_nombre or not col_codigo:
        raise HTTPException(
            status_code=422,
            detail="El CSV debe tener columnas 'Nombre' y 'Codigo' (o 'Código')",
        )

    importados = 0
    errores: List[str] = []

    for i, fila in enumerate(lector, start=2):
        nombre = (fila.get(col_nombre) or "").strip().upper()
        codigo = (fila.get(col_codigo) or "").strip()
        if not nombre or not codigo:
            errores.append(f"Fila {i}: nombre o código vacío, se omite")
            continue
        db.add(Estudiante(
            nombre_completo=nombre,
            codigo_estudiante=codigo,
            seccion_id=seccion_id,
        ))
        importados += 1

    db.commit()
    return ImportacionCSVResultado(importados=importados, errores=errores)


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
