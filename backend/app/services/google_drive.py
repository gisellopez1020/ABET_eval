"""
Servicio de subida de archivos a Google Drive via Google Drive API v3.
Lo usa services/reportes.py para guardar el detalle ABET en el Drive del docente.
Cuando SKIP_AUTH=true, solo registra en el log local en lugar de llamar a la API.
"""
import io
import logging

from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

from app.config import settings
from app.services.google_auth import (
    SCOPES,
    TOKEN_ENDPOINT,
    actualizar_access_token_drive,
    descartar_tokens_drive,
    obtener_tokens_drive,
)

logger = logging.getLogger("abet.google_drive")

_carpeta_cache: dict[str, str] = {}  # email → id de la carpeta ABET_Eval en su Drive

MENSAJE_REAUTENTICAR = (
    "Google rechazó la renovación del acceso a Google Drive (es posible que hayas "
    "revocado el permiso desde tu cuenta de Google). Vuelve a iniciar sesión con Google."
)
MENSAJE_REFRESH_TEMPORAL = (
    "Google no pudo renovar el acceso a Google Drive en este momento; inténtalo de nuevo más tarde."
)


def _credenciales_drive(email: str, tokens: dict) -> Credentials:
    """
    Construye las credenciales del docente con lo necesario para renovarse.

    Si el access_token ya venció, lo renueva aquí con el refresh_token y guarda
    el nuevo. Si Drive responde 401 por otro motivo (p. ej. desfase de reloj),
    google-auth también renueva y reintenta por su cuenta con estos mismos datos.
    Lanza RefreshError si Google rechaza la renovación.
    """
    credentials = Credentials(
        token=tokens["access_token"],
        refresh_token=tokens.get("refresh_token"),
        token_uri=TOKEN_ENDPOINT,
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=SCOPES,
        expiry=tokens.get("expires_at"),
    )
    if credentials.expired:
        credentials.refresh(Request())
        actualizar_access_token_drive(email, credentials.token, credentials.expiry)
    return credentials


def _guardar_token_renovado(email: str, tokens: dict, credentials: Credentials) -> None:
    """Guarda el token si google-auth lo renovó durante la llamada (camino del 401)."""
    if credentials.token != tokens.get("access_token"):
        actualizar_access_token_drive(email, credentials.token, credentials.expiry)


def _mensaje_refresh_fallido(email: str, exc: RefreshError) -> str:
    """Traduce un fallo de renovación a un mensaje para el docente."""
    if exc.retryable:
        logger.warning("Fallo temporal renovando el token de Google de %s: %s", email, exc)
        return MENSAJE_REFRESH_TEMPORAL
    # refresh_token revocado/inválido: los tokens guardados ya no sirven
    logger.warning("Google rechazó el refresh_token de %s: %s", email, exc)
    descartar_tokens_drive(email)
    return MENSAJE_REAUTENTICAR


def _build_drive_service(credentials: Credentials):
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


def _escapar_q(valor: str) -> str:
    """Escapa un literal para la sintaxis de búsqueda `q` de Drive (comillas simples y barras)."""
    return valor.replace("\\", "\\\\").replace("'", "\\'")


def _subir_archivo(credentials: Credentials, email: str, nombre: str, contenido: bytes, mimetype: str) -> dict:
    service = _build_drive_service(credentials)
    carpeta_id = _obtener_o_crear_carpeta(service, email)

    query = f"name = '{_escapar_q(nombre)}' and '{carpeta_id}' in parents and trashed = false"
    existentes = service.files().list(q=query, fields="files(id)").execute().get("files", [])

    media = MediaIoBaseUpload(io.BytesIO(contenido), mimetype=mimetype)
    if existentes:
        # Reemplaza el contenido: Drive conserva las versiones anteriores en su historial
        return service.files().update(
            fileId=existentes[0]["id"], media_body=media, fields="id, webViewLink"
        ).execute()
    metadata = {"name": nombre, "parents": [carpeta_id]}
    return service.files().create(body=metadata, media_body=media, fields="id, webViewLink").execute()


def subir_archivo(email: str, nombre: str, contenido: bytes, mimetype: str) -> dict:
    """
    Sube (o reemplaza) un archivo en la carpeta ABET_Eval del docente.
    Nunca lanza: devuelve {"estado": "sincronizado"|"simulado"|"error", "detalle", "enlace"}
    para que quien llama pueda entregar el archivo aunque Drive falle.
    En modo SKIP_AUTH solo simula la operación.
    """
    if settings.skip_auth:
        logger.info("Subiendo a Google Drive: %s [modo simulado]", nombre)
        return {"estado": "simulado", "detalle": None, "enlace": None}

    tokens = obtener_tokens_drive(email)
    if not tokens or not tokens.get("access_token"):
        return {
            "estado": "error",
            "detalle": "No hay una sesión de Google Drive activa; vuelve a iniciar sesión con Google.",
            "enlace": None,
        }

    try:
        credentials = _credenciales_drive(email, tokens)
        archivo = _subir_archivo(credentials, email, nombre, contenido, mimetype)
        _guardar_token_renovado(email, tokens, credentials)
        return {"estado": "sincronizado", "detalle": None, "enlace": archivo.get("webViewLink")}
    except RefreshError as exc:
        return {"estado": "error", "detalle": _mensaje_refresh_fallido(email, exc), "enlace": None}
    except Exception as exc:  # error de Drive (HttpError), sin conexión (TransportError, socket), etc.
        logger.exception("Error subiendo %s a Google Drive", nombre)
        return {"estado": "error", "detalle": f"No se pudo subir a Google Drive: {exc}", "enlace": None}
