"""
Servicio de sincronización con OneDrive via Microsoft Graph API.
Cuando SKIP_AUTH=true, solo registra en el log local en lugar de llamar a Graph API.
"""
import logging
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger("abet.onedrive")

GRAPH_BASE = "https://graph.microsoft.com/v1.0"

_sync_status: dict[int, str] = {}  # calificacion_id → "sincronizado"|"error"


async def sincronizar_calificacion(calificacion_id: int, access_token: Optional[str] = None) -> dict:
    """
    Sube el resumen de la calificación a OneDrive.
    En modo SKIP_AUTH solo simula la operación.
    """
    if settings.skip_auth:
        logger.info("Sincronizando con OneDrive: calificacion_id=%s [modo simulado]", calificacion_id)
        _sync_status[calificacion_id] = "sincronizado"
        return {"status": "sincronizado", "calificacion_id": calificacion_id, "modo": "simulado"}

    if not access_token:
        _sync_status[calificacion_id] = "error"
        return {"status": "error", "detalle": "Token de acceso requerido para OneDrive"}

    headers = {"Authorization": f"Bearer {access_token}"}
    carpeta = settings.onedrive_folder_name
    nombre_archivo = f"calificacion_{calificacion_id}.json"

    try:
        async with httpx.AsyncClient() as client:
            # Crear carpeta si no existe (usa PUT upsert)
            url = f"{GRAPH_BASE}/me/drive/root:/{carpeta}/{nombre_archivo}:/content"
            contenido = f'{{"calificacion_id": {calificacion_id}}}'.encode()
            resp = await client.put(url, headers=headers, content=contenido)
            resp.raise_for_status()

        _sync_status[calificacion_id] = "sincronizado"
        return {"status": "sincronizado", "calificacion_id": calificacion_id}

    except httpx.HTTPStatusError as exc:
        logger.error("Error OneDrive para calificacion %s: %s", calificacion_id, exc)
        _sync_status[calificacion_id] = "error"
        return {"status": "error", "detalle": str(exc)}


def obtener_estado_global() -> dict:
    """Devuelve un resumen del estado de sincronización de todas las calificaciones."""
    total = len(_sync_status)
    sincronizados = sum(1 for v in _sync_status.values() if v == "sincronizado")
    errores = total - sincronizados
    estado_general = "sincronizado" if errores == 0 and total > 0 else ("error" if errores > 0 else "sin_actividad")
    return {
        "estado": estado_general,
        "total": total,
        "sincronizados": sincronizados,
        "errores": errores,
        "modo_simulado": settings.skip_auth,
    }
