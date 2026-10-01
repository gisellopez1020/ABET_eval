from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.schemas.equipo import EquiposPayload, EquipoUpdate, EquipoOut, ModoCalificacionResponse
from app.services.equipos import EquipoService

# Los errores de negocio (400, 403, 404) los lanza EquipoService y los traduce
# a HTTP el manejador global registrado en main.py (app/errores_http.py)
router = APIRouter(tags=["Equipos de trabajo"])


@router.get(
    "/actividades/{actividad_id}/secciones/{seccion_id}/equipos",
    response_model=List[EquipoOut],
    summary="Listar equipos de trabajo",
)
def listar_equipos(
    actividad_id: int,
    seccion_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Lista los equipos de trabajo para la actividad en la sección indicada.
    404 si la actividad no existe o la sección no es de su curso, 403 si es de otro docente.
    """
    return EquipoService(db).listar(actividad_id, seccion_id, usuario["email"])


@router.post(
    "/actividades/{actividad_id}/secciones/{seccion_id}/equipos",
    response_model=List[EquipoOut],
    status_code=status.HTTP_201_CREATED,
    summary="Crear equipos de trabajo",
)
def crear_equipos(
    actividad_id: int,
    seccion_id: int,
    body: EquiposPayload,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Crea uno o varios equipos de trabajo para la actividad en la sección.
    Cada equipo puede incluir una lista de estudiante_ids; cada estudiante debe ser
    de la sección y no estar ya en otro equipo de la actividad (400 si no).
    404 si la actividad no existe o la sección no es de su curso, 403 si es de otro docente.
    """
    return EquipoService(db).crear(actividad_id, seccion_id, usuario["email"], body.equipos)


@router.put(
    "/equipos/{equipo_id}",
    response_model=EquipoOut,
    summary="Editar equipo de trabajo",
)
def editar_equipo(
    equipo_id: int,
    body: EquipoUpdate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Edita el nombre del equipo y/o sus integrantes. Cada integrante debe ser de la
    sección del equipo y no estar en otro equipo de la actividad (400 si no).
    404 si el equipo no existe, 403 si es de otro docente.
    """
    return EquipoService(db).editar(equipo_id, usuario["email"], body.nombre, body.estudiante_ids)


@router.get(
    "/actividades/{actividad_id}/modo-calificacion/{seccion_id}",
    response_model=ModoCalificacionResponse,
    summary="Obtener modo de calificación (bifurcación grupal/individual)",
)
def modo_calificacion(
    actividad_id: int,
    seccion_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Clave para el frontend: determina si se califica por equipos o por estudiantes.
    Retorna: { tipo, items: [equipos|estudiantes], total, calificados }
    404 si la actividad no existe o la sección no es de su curso, 403 si es de otro docente.
    """
    return EquipoService(db).modo_calificacion(actividad_id, seccion_id, usuario["email"])
