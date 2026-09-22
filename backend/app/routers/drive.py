from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.services.google_drive import sincronizar_calificacion, obtener_estado_global

router = APIRouter(prefix="/drive", tags=["Google Drive"])


@router.post(
    "/sync/{calificacion_id}",
    summary="Forzar sincronización de una calificación con Google Drive",
)
async def sync_calificacion(
    calificacion_id: int,
    usuario: dict = Depends(get_current_user),
):
    """
    Sube el resumen de la calificación a la carpeta de Google Drive del docente.
    En modo SKIP_AUTH=true simula la operación sin llamar a la API de Google.
    """
    return await sincronizar_calificacion(calificacion_id, email=usuario["email"])


@router.get(
    "/status",
    summary="Estado de sincronización global con Google Drive",
)
def estado_sync(_usuario: dict = Depends(get_current_user)):
    """Devuelve el resumen del estado de sincronización de todas las calificaciones."""
    return obtener_estado_global()
