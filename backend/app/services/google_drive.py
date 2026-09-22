"""
Servicio de sincronización con Google Drive via Google Drive API v3.
Cuando SKIP_AUTH=true, solo registra en el log local en lugar de llamar a la API.
"""
import asyncio
import io
import logging
from typing import Optional

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseUpload

from app.config import settings
from app.services.google_auth import obtener_tokens_drive

logger = logging.getLogger("abet.google_drive")

_sync_status: dict[int, str] = {}  # calificacion_id → "sincronizado"|"error"

_carpeta_cache: dict[str, str] = {}  # email → id de la carpeta ABET_Eval en su Drive


def _build_drive_service(access_token: str):
    credentials = Credentials(token=access_token)
    return build("drive", "v3", credentials=credentials, cache_discovery=False)


def _obtener_o_crear_carpeta(service, email: str) -> str:
    if email in _carpeta_cache:
        return _carpeta_cache[email]

    carpeta = settings.google_drive_folder_name
    query = (
        f"name = '{carpeta}' and mimeType = 'application/vnd.google-apps.folder' "
        "and trashed = false"
    )
    resultados = service.files().list(q=query, fields="files(id, name)").execute()
    archivos = resultados.get("files", [])
    if archivos:
        carpeta_id = archivos[0]["id"]
    else:
        metadata = {"name": carpeta, "mimeType": "application/vnd.google-apps.folder"}
        creada = service.files().create(body=metadata, fields="id").execute()
        carpeta_id = creada["id"]

    _carpeta_cache[email] = carpeta_id
    return carpeta_id


def _subir_calificacion(access_token: str, email: str, calificacion_id: int) -> None:
    service = _build_drive_service(access_token)
    carpeta_id = _obtener_o_crear_carpeta(service, email)
    nombre_archivo = f"calificacion_{calificacion_id}.json"
    contenido = f'{{"calificacion_id": {calificacion_id}}}'.encode()

    query = (
        f"name = '{nombre_archivo}' and '{carpeta_id}' in parents and trashed = false"
    )
    resultados = service.files().list(q=query, fields="files(id)").execute()
    existentes = resultados.get("files", [])

    media = MediaIoBaseUpload(io.BytesIO(contenido), mimetype="application/json")
    if existentes:
        service.files().update(fileId=existentes[0]["id"], media_body=media).execute()
    else:
        metadata = {"name": nombre_archivo, "parents": [carpeta_id]}
        service.files().create(body=metadata, media_body=media, fields="id").execute()


async def sincronizar_calificacion(calificacion_id: int, email: Optional[str] = None) -> dict:
    """
    Sube el resumen de la calificación a Google Drive.
    En modo SKIP_AUTH solo simula la operación.
    """
    if settings.skip_auth:
        logger.info("Sincronizando con Google Drive: calificacion_id=%s [modo simulado]", calificacion_id)
        _sync_status[calificacion_id] = "sincronizado"
        return {"status": "sincronizado", "calificacion_id": calificacion_id, "modo": "simulado"}

    tokens = obtener_tokens_drive(email) if email else None
    if not tokens or not tokens.get("access_token"):
        _sync_status[calificacion_id] = "error"
        return {"status": "error", "detalle": "Token de acceso de Google Drive requerido"}

    try:
        await asyncio.to_thread(
            _subir_calificacion, tokens["access_token"], email, calificacion_id
        )
        _sync_status[calificacion_id] = "sincronizado"
        return {"status": "sincronizado", "calificacion_id": calificacion_id}

    except HttpError as exc:
        logger.error("Error Google Drive para calificacion %s: %s", calificacion_id, exc)
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
