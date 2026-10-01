from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.schemas import ActividadCreate, ActividadUpdate, ActividadOut
from app.services.actividades import ActividadService

# Los errores de negocio (404, 403, 409) los lanza ActividadService y los traduce
# a HTTP el manejador global registrado en main.py (app/errores_http.py)
router = APIRouter(tags=["Actividades"])


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
    """
    Devuelve todas las actividades del curso ordenadas por fecha de creación,
    con la suma de pesos de sus criterios calculada en una sola consulta.
    404 si el curso no existe, 403 si es de otro docente.
    """
    return ActividadService(db).listar(curso_id, usuario["email"])


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
    """
    Crea una actividad (individual o grupal) dentro del curso.
    404 si el curso no existe, 403 si es de otro docente.
    """
    return ActividadService(db).crear(curso_id, usuario["email"], body.model_dump())


@router.get(
    "/actividades/{actividad_id}",
    summary="Detalle de actividad con aspectos y criterios",
)
def obtener_actividad(
    actividad_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Devuelve la actividad con sus aspectos y criterios anidados.
    404 si la actividad no existe, 403 si es de otro docente.
    """
    detalle = ActividadService(db).obtener(actividad_id, usuario["email"])
    # Sin response_model y con model_dump() en modo Python a propósito: los Decimal
    # salen como número (20.0), como siempre ha respondido este endpoint. Con
    # response_model, o devolviendo el modelo sin volcar, saldrían como texto ("20.00")
    return detalle.model_dump()


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
    Edita el nombre y/o el peso en la nota final; solo cambia los campos enviados.
    El tipo (individual/grupal) no es editable.
    404 si la actividad no existe, 403 si es de otro docente.
    """
    return ActividadService(db).editar(actividad_id, usuario["email"], body.model_dump(exclude_none=True))


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
    """
    Elimina la actividad solo si no tiene calificaciones registradas.
    409 si las tiene, 404 si la actividad no existe, 403 si es de otro docente.
    """
    ActividadService(db).eliminar(actividad_id, usuario["email"])
