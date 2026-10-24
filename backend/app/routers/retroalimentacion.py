from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.schemas.retroalimentacion import RetroalimentacionOut
from app.services.retroalimentacion import RetroalimentacionService

# Los errores de negocio (403, 404) los lanza el servicio y los traduce a HTTP el
# manejador global registrado en main.py (app/errores_http.py)
router = APIRouter(tags=["Retroalimentación"])

# Síncronos a propósito: FastAPI los corre en su pool de hilos, así que esperar a la IA
# (como mucho GEMINI_TIMEOUT_SEGUNDOS) no bloquea las demás peticiones


@router.get(
    "/actividades/{actividad_id}/equipos/{equipo_id}/retroalimentacion",
    response_model=RetroalimentacionOut,
    summary="Retroalimentación de un equipo en una actividad",
)
def retroalimentacion_equipo(
    actividad_id: int,
    equipo_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Retroalimentación según la rúbrica y la calificación guardada del equipo. Con la
    calificación completa la redacta la IA (la primera vez o si cambiaron los datos) y la
    guarda; si la IA no está configurada o falla, devuelve la estructurada por aspecto.
    404 si la actividad no existe o el equipo no es de ella, 403 si es de otro docente.
    """
    return RetroalimentacionService(db).de_equipo(actividad_id, equipo_id, usuario["email"])


@router.get(
    "/actividades/{actividad_id}/estudiantes/{estudiante_id}/retroalimentacion",
    response_model=RetroalimentacionOut,
    summary="Retroalimentación individual de un estudiante en una actividad",
)
def retroalimentacion_estudiante(
    actividad_id: int,
    estudiante_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Igual que la de equipo, con las calificaciones individuales del estudiante.
    404 si la actividad no existe o el estudiante no es de su curso, 403 si es de otro docente.
    """
    return RetroalimentacionService(db).de_estudiante(actividad_id, estudiante_id, usuario["email"])
