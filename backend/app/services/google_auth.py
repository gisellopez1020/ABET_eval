"""
Servicio de autenticación OAuth 2.0 con Google (Authorization Code flow).
Intercambia el code de autorización por tokens y valida el id_token.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import settings
from app.repositories.token_drive import TokenDriveRepository
from app.utils.cifrado import cifrar, descifrar

logger = logging.getLogger("abet.google_auth")

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"

SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/drive.file",
]

# Tokens de Google Drive por docente
# (email → {"access_token", "refresh_token", "expires_at"}).
# Permite que el servicio de Google Drive actúe en nombre del docente sin
# depender de que el frontend reenvíe un token adicional en cada llamada.
# El refresh_token también se guarda cifrado en la base (tabla tokens_drive)
# para que la sesión de Drive sobreviva a un reinicio del backend.
_google_tokens: dict[str, dict] = {}


def build_authorization_url(state: Optional[str] = None) -> str:
    """Construye la URL de consentimiento de Google para iniciar el login."""
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    if state:
        params["state"] = state
    return f"{AUTH_ENDPOINT}?{urlencode(params)}"


async def exchange_code_for_tokens(code: str) -> dict:
    """Intercambia el authorization code por tokens (access_token, id_token, refresh_token)."""
    data = {
        "code": code,
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
        "redirect_uri": settings.google_redirect_uri,
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(TOKEN_ENDPOINT, data=data)

    if resp.status_code != 200:
        logger.error("Error intercambiando code por tokens de Google: %s", resp.text)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se pudo completar la autenticación con Google",
        )
    return resp.json()


def verify_id_token(id_token_str: str) -> dict:
    """Valida la firma y el emisor del id_token y devuelve el email/nombre del docente."""
    try:
        claims = google_id_token.verify_oauth2_token(
            id_token_str,
            google_requests.Request(),
            settings.google_client_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"id_token inválido: {exc}",
        ) from exc

    email = claims.get("email")
    nombre = claims.get("name", "")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="id_token inválido: no contiene email del usuario",
        )
    return {"email": email, "nombre": nombre}


def _utcnow() -> datetime:
    # UTC sin tzinfo: es el formato que google-auth espera en Credentials.expiry
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _refresh_token_guardado(db: Session, email: str) -> Optional[str]:
    """El refresh_token del docente guardado en la base, o None si no hay o no se puede leer.

    Si no se puede descifrar (TOKEN_ENCRYPTION_KEY cambió o se perdió) se trata como
    "sin sesión de Drive": la fila no se borra, el próximo login la reemplaza.
    """
    try:
        fila = TokenDriveRepository(db).de(email)
    except SQLAlchemyError as exc:
        # Solo el tipo: el mensaje de SQLAlchemy puede incluir los valores de la consulta
        logger.error("No se pudo leer el acceso a Google Drive de %s: %s", email, type(exc).__name__)
        return None
    if fila is None:
        return None
    refresh_token = descifrar(fila.refresh_token_cifrado)
    if refresh_token is None:
        logger.warning(
            "No se pudo descifrar el acceso a Google Drive de %s (¿cambió TOKEN_ENCRYPTION_KEY?)", email
        )
    return refresh_token


def guardar_tokens_drive(db: Session, email: str, tokens: dict) -> None:
    """
    Guarda los tokens de Google Drive del docente: todos en memoria y el refresh_token,
    cifrado, en la base. Si Google no devolvió refresh_token, conserva el guardado.
    Un fallo de la base no impide el login: Drive funciona desde la memoria hasta el
    próximo reinicio.
    """
    expires_in = tokens.get("expires_in")
    refresh_token = tokens.get("refresh_token")
    if refresh_token:
        try:
            TokenDriveRepository(db).guardar(email, cifrar(refresh_token))
            db.commit()
        except (SQLAlchemyError, ValueError) as exc:
            db.rollback()
            logger.error("No se pudo guardar el acceso a Google Drive de %s: %s", email, type(exc).__name__)
    else:
        anterior = _google_tokens.get(email) or {}
        refresh_token = anterior.get("refresh_token") or _refresh_token_guardado(db, email)
    _google_tokens[email] = {
        "access_token": tokens.get("access_token"),
        "refresh_token": refresh_token,
        "expires_at": _utcnow() + timedelta(seconds=int(expires_in)) if expires_in else None,
    }


def actualizar_access_token_drive(email: str, access_token: str, expires_at: Optional[datetime]) -> None:
    """Guarda el access_token renovado con el refresh_token, conservando este último."""
    tokens = _google_tokens.get(email)
    if tokens is None:
        return
    tokens["access_token"] = access_token
    tokens["expires_at"] = expires_at


def descartar_tokens_drive(db: Session, email: str) -> None:
    """Olvida los tokens del docente, en memoria y en la base (Google revocó el acceso o cerró sesión)."""
    _google_tokens.pop(email, None)
    try:
        TokenDriveRepository(db).borrar(email)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("No se pudo borrar el acceso a Google Drive de %s: %s", email, type(exc).__name__)


def obtener_tokens_drive(db: Session, email: str) -> Optional[dict]:
    """
    Recupera los tokens de Google Drive del docente, si existen. Tras un reinicio la
    memoria está vacía: se carga el refresh_token de la base, sin access_token, y quien
    lo use debe renovarlo (ver google_drive._credenciales_drive).
    """
    tokens = _google_tokens.get(email)
    if tokens is not None:
        return tokens
    refresh_token = _refresh_token_guardado(db, email)
    if refresh_token is None:
        return None
    tokens = {"access_token": None, "refresh_token": refresh_token, "expires_at": None}
    _google_tokens[email] = tokens
    return tokens
