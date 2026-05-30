from fastapi import APIRouter, Depends, Header
from typing import Optional

from app.auth.dependencies import get_current_user
from app.services.onedrive import sincronizar_calificacion, obtener_estado_global

router = APIRouter(prefix="/onedrive", tags=["OneDrive"])


@router.post(
    "/sync/{calificacion_id}",
    summary="Forzar sincronización de una calificación con OneDrive",
)
async def sync_calificacion(
    calificacion_id: int,
    authorization: Optional[str] = Header(default=None),
    _usuario: dict = Depends(get_current_user),
):
    """
    Sube el resumen de la calificación a la carpeta OneDrive del docente.
    En modo SKIP_AUTH=true simula la operación sin llamar a Microsoft Graph.
    """
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
    return await sincronizar_calificacion(calificacion_id, access_token=token)


@router.get(
    "/status",
    summary="Estado de sincronización global con OneDrive",
)
def estado_sync(_usuario: dict = Depends(get_current_user)):
    """Devuelve el resumen del estado de sincronización de todas las calificaciones."""
    return obtener_estado_global()
