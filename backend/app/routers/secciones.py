from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import Curso, Seccion
from app.schemas import SeccionCreate, SeccionUpdate, SeccionOut

router = APIRouter(tags=["Secciones"])


def _verificar_curso(curso_id: int, email: str, db: Session) -> Curso:
    curso = db.get(Curso, curso_id)
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    if curso.docente_email != email:
        raise HTTPException(status_code=403, detail="No tiene permiso sobre este curso")
    return curso


def _seccion_con_total(seccion: Seccion) -> SeccionOut:
    out = SeccionOut.model_validate(seccion)
    out.total_estudiantes = len(seccion.estudiantes)
    return out


@router.get(
    "/cursos/{curso_id}/secciones",
    response_model=List[SeccionOut],
    summary="Listar secciones del curso",
)
def listar_secciones(
    curso_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Devuelve las secciones activas del curso con su conteo de estudiantes."""
    _verificar_curso(curso_id, usuario["email"], db)
    secciones = (
        db.query(Seccion)
        .filter(Seccion.curso_id == curso_id, Seccion.activo == True)
        .all()
    )
    return [_seccion_con_total(s) for s in secciones]


@router.post(
    "/cursos/{curso_id}/secciones",
    response_model=SeccionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear sección",
)
def crear_seccion(
    curso_id: int,
    body: SeccionCreate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Crea una nueva sección (grupo) dentro del curso."""
    _verificar_curso(curso_id, usuario["email"], db)
    seccion = Seccion(nombre=body.nombre, curso_id=curso_id)
    db.add(seccion)
    db.commit()
    db.refresh(seccion)
    return _seccion_con_total(seccion)


@router.put("/secciones/{seccion_id}", response_model=SeccionOut, summary="Editar sección")
def editar_seccion(
    seccion_id: int,
    body: SeccionUpdate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Renombra una sección existente."""
    seccion = db.get(Seccion, seccion_id)
    if not seccion:
        raise HTTPException(status_code=404, detail="Sección no encontrada")
    _verificar_curso(seccion.curso_id, usuario["email"], db)
    seccion.nombre = body.nombre
    db.commit()
    db.refresh(seccion)
    return _seccion_con_total(seccion)


@router.delete(
    "/secciones/{seccion_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar sección",
)
def eliminar_seccion(
    seccion_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Elimina una sección solo si no tiene estudiantes registrados.
    Si tiene estudiantes, retorna 409 Conflict.
    """
    seccion = db.get(Seccion, seccion_id)
    if not seccion:
        raise HTTPException(status_code=404, detail="Sección no encontrada")
    _verificar_curso(seccion.curso_id, usuario["email"], db)

    if seccion.estudiantes:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No se puede eliminar la sección '{seccion.nombre}' porque tiene "
                   f"{len(seccion.estudiantes)} estudiante(s) registrado(s). "
                   "Elimine los estudiantes primero.",
        )

    db.delete(seccion)
    db.commit()
