"""
Servicio de autenticación OAuth 2.0 con Google (Authorization Code flow).
Intercambia el code de autorización por tokens y valida el id_token.
"""
import logging
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from app.config import settings

logger = logging.getLogger("abet.google_auth")

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"

SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/drive.file",
]

# Tokens de Google Drive por docente (email → {"access_token", "refresh_token"}).
# Permite que el servicio de Google Drive actúe en nombre del docente sin
# depender de que el frontend reenvíe un token adicional en cada llamada.
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


def guardar_tokens_drive(email: str, tokens: dict) -> None:
    """Guarda el access_token/refresh_token de Google Drive del docente en memoria."""
    _google_tokens[email] = {
        "access_token": tokens.get("access_token"),
        "refresh_token": tokens.get("refresh_token"),
    }


def obtener_tokens_drive(email: str) -> Optional[dict]:
    """Recupera los tokens de Google Drive guardados para el docente, si existen."""
    return _google_tokens.get(email)
