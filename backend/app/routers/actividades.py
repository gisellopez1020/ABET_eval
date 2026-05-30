from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import exists

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import Curso, Actividad, Calificacion, Criterio, Aspecto
from app.schemas import ActividadCreate, ActividadUpdate, ActividadOut
from app.schemas.criterio import AspectoOut

router = APIRouter(tags=["Actividades"])


def _verificar_curso(curso_id: int, email: str, db: Session) -> Curso:
    curso = db.get(Curso, curso_id)
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    if curso.docente_email != email:
        raise HTTPException(status_code=403, detail="No tiene permiso sobre este curso")
    return curso


def _tiene_calificaciones(actividad_id: int, db: Session) -> bool:
    return db.query(
        exists().where(
            Calificacion.criterio_id == Criterio.id,
            Criterio.aspecto_id == Aspecto.id,
            Aspecto.actividad_id == actividad_id,
        )
    ).scalar()


@router.get(
    "/cursos/{curso_id}/actividades",
    response_model=List[ActividadOut],
    summary="Listar actividades del curso",
)
def listar_actividades(
    curso_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Devuelve todas las actividades del curso ordenadas por fecha de creación."""
    _verificar_curso(curso_id, usuario["email"], db)
    return (
        db.query(Actividad)
        .filter(Actividad.curso_id == curso_id)
        .order_by(Actividad.created_at)
        .all()
    )


@router.post(
    "/cursos/{curso_id}/actividades",
    response_model=ActividadOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear actividad",
)
def crear_actividad(
    curso_id: int,
    body: ActividadCreate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Crea una actividad (individual o grupal) dentro del curso."""
    _verificar_curso(curso_id, usuario["email"], db)
    actividad = Actividad(**body.model_dump(), curso_id=curso_id)
    db.add(actividad)
    db.commit()
    db.refresh(actividad)
    return actividad


@router.get(
    "/actividades/{actividad_id}",
    summary="Detalle de actividad con aspectos y criterios",
)
def obtener_actividad(
    actividad_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Devuelve la actividad con sus aspectos y criterios anidados."""
    actividad = db.get(Actividad, actividad_id)
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    curso = db.get(Curso, actividad.curso_id)
    if not curso or curso.docente_email != usuario["email"]:
        raise HTTPException(status_code=403, detail="No tiene permiso sobre esta actividad")

    out = ActividadOut.model_validate(actividad)
    aspectos_out = [AspectoOut.model_validate(a) for a in actividad.aspectos]
    return {**out.model_dump(), "aspectos": [a.model_dump() for a in aspectos_out]}


@router.put(
    "/actividades/{actividad_id}",
    response_model=ActividadOut,
    summary="Editar actividad",
)
def editar_actividad(
    actividad_id: int,
    body: ActividadUpdate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Edita nombre o peso de la actividad.
    El tipo (individual/grupal) NO puede modificarse si ya hay calificaciones.
    """
    actividad = db.get(Actividad, actividad_id)
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    curso = db.get(Curso, actividad.curso_id)
    if not curso or curso.docente_email != usuario["email"]:
        raise HTTPException(status_code=403, detail="No tiene permiso sobre esta actividad")

    for campo, valor in body.model_dump(exclude_none=True).items():
        setattr(actividad, campo, valor)

    db.commit()
    db.refresh(actividad)
    return actividad


@router.delete(
    "/actividades/{actividad_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar actividad",
)
def eliminar_actividad(
    actividad_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Elimina la actividad solo si no tiene calificaciones registradas."""
    actividad = db.get(Actividad, actividad_id)
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    curso = db.get(Curso, actividad.curso_id)
    if not curso or curso.docente_email != usuario["email"]:
        raise HTTPException(status_code=403, detail="No tiene permiso sobre esta actividad")

    if _tiene_calificaciones(actividad_id, db):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No se puede eliminar '{actividad.nombre}' porque ya tiene "
                   "calificaciones registradas.",
        )

    db.delete(actividad)
    db.commit()
