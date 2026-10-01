from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.schemas.calificacion import (
    CalificacionCreate, CalificacionOut, CalificacionUpdate,
    CalificacionMasivo, ResumenCalificacion,
)
from app.services.calificaciones import CalificacionService

# Los errores de negocio (400, 403, 404) los lanza CalificacionService y los traduce
# a HTTP el manejador global registrado en main.py (app/errores_http.py)
router = APIRouter(tags=["Calificaciones"])


@router.get(
    "/actividades/{actividad_id}/calificaciones/{seccion_id}",
    response_model=List[ResumenCalificacion],
    summary="Resumen de calificaciones de una actividad por sección",
)
def resumen_calificaciones(
    actividad_id: int,
    seccion_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Devuelve el estado de calificación para cada equipo (grupal)
    o estudiante (individual) de la sección.
    404 si la actividad no existe o la sección no es de su curso, 403 si es de otro docente.
    """
    return CalificacionService(db).resumen(actividad_id, seccion_id, usuario["email"])


@router.get(
    "/actividades/{actividad_id}/equipos/{equipo_id}/calificaciones",
    response_model=List[CalificacionOut],
    summary="Calificaciones de un equipo en una actividad",
)
def calificaciones_equipo(
    actividad_id: int,
    equipo_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Devuelve las calificaciones guardadas de un equipo, una por criterio calificado
    de la actividad. Los criterios sin fila todavía no tienen calificación.
    404 si la actividad no existe o el equipo no es de ella, 403 si es de otro docente.
    """
    return CalificacionService(db).de_equipo(actividad_id, equipo_id, usuario["email"])


@router.get(
    "/actividades/{actividad_id}/estudiantes/{estudiante_id}/calificaciones",
    response_model=List[CalificacionOut],
    summary="Calificaciones individuales de un estudiante en una actividad",
)
def calificaciones_estudiante(
    actividad_id: int,
    estudiante_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Devuelve las calificaciones individuales guardadas de un estudiante, una por
    criterio calificado de la actividad. No incluye las de sus equipos.
    404 si la actividad no existe o el estudiante no es de su curso, 403 si es de otro docente.
    """
    return CalificacionService(db).de_estudiante(actividad_id, estudiante_id, usuario["email"])


@router.post(
    "/calificaciones",
    response_model=List[CalificacionOut],
    status_code=status.HTTP_201_CREATED,
    summary="Guardar calificación completa",
)
def guardar_calificacion(
    body: CalificacionCreate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Guarda la calificación de un equipo o estudiante para una actividad.
    Recibe todos los valores de criterios a la vez.
    Si ya existe calificación previa para algún criterio, la reemplaza.
    400 si el equipo, el estudiante o algún criterio no son de la actividad (no se
    guarda nada), 404 si la actividad o el estudiante no existen, 403 si es de otro docente.
    """
    return CalificacionService(db).guardar(
        usuario["email"], body.actividad_id, body.criterios, body.equipo_id, body.estudiante_id,
    )


@router.patch(
    "/calificaciones/{calificacion_id}",
    response_model=CalificacionOut,
    summary="Editar valor de una calificación",
)
def editar_calificacion(
    calificacion_id: int,
    body: CalificacionUpdate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Actualiza el valor binario de una calificación y recalcula su puntaje parcial.
    404 si la calificación no existe, 403 si es de otro docente.
    """
    return CalificacionService(db).editar(calificacion_id, usuario["email"], body.valor)


@router.post(
    "/actividades/{actividad_id}/calificaciones/masivo",
    response_model=List[CalificacionOut],
    status_code=status.HTTP_201_CREATED,
    summary="Aplicar calificación masiva a todos los equipos sin calificar",
)
def calificacion_masivo(
    actividad_id: int,
    body: CalificacionMasivo,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Aplica los mismos valores de criterios a todos los equipos de la sección
    que todavía no tienen calificación. Los equipos ya calificados no se modifican;
    uno calificado en parte conserva lo que tiene y solo recibe los criterios que le faltan.
    404 si la actividad no existe o la sección no es de su curso, 403 si es de otro docente.
    """
    return CalificacionService(db).masivo(actividad_id, body.seccion_id, usuario["email"], body.criterios)
