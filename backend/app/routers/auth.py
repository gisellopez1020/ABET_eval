import secrets
from urllib.parse import urlencode, urlparse

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.auth.dependencies import create_access_token, get_current_user
from app.config import settings
from app.services.google_auth import (
    build_authorization_url,
    exchange_code_for_tokens,
    guardar_tokens_drive,
    verify_id_token,
)

router = APIRouter(prefix="/auth", tags=["Autenticación"])

STATE_COOKIE_NAME = "oauth_state"
STATE_COOKIE_MAX_AGE = 300


class DocenteOut(BaseModel):
    email: str
    nombre: str


def _es_localhost(url: str) -> bool:
    return (urlparse(url).hostname or "") in ("localhost", "127.0.0.1")


@router.get("/login", summary="Redirige a la pantalla de consentimiento de Google")
def login():
    """Inicia el flujo OAuth 2.0 Authorization Code redirigiendo a Google."""
    state = secrets.token_urlsafe(24)
    response = RedirectResponse(url=build_authorization_url(state=state))
    response.set_cookie(
        key=STATE_COOKIE_NAME,
        value=state,
        httponly=True,
        samesite="lax",
        max_age=STATE_COOKIE_MAX_AGE,
        secure=not _es_localhost(settings.google_redirect_uri),
        path="/auth",
    )
    return response


@router.get("/callback", summary="Callback OAuth de Google")
async def callback(
    code: str = Query(...),
    state: str | None = Query(default=None),
    oauth_state: str | None = Cookie(default=None, alias=STATE_COOKIE_NAME),
):
    """
    Recibe el authorization code de Google, lo intercambia por tokens,
    valida el id_token y emite el JWT propio de la app. Redirige al
    frontend con el JWT como parámetro de consulta.

    Antes de nada, valida el parámetro `state` contra la cookie `oauth_state`
    (protección CSRF) — si no coincide, no se llega a intercambiar el code.
    """
    if not state or not oauth_state or not secrets.compare_digest(oauth_state, state):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Posible ataque CSRF: el parámetro state no coincide",
        )

    tokens = await exchange_code_for_tokens(code)

    id_token_str = tokens.get("id_token")
    if not id_token_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="La respuesta de Google no incluyó id_token",
        )

    usuario = verify_id_token(id_token_str)
    guardar_tokens_drive(usuario["email"], tokens)

    app_token = create_access_token(usuario["email"], usuario["nombre"])
    redirect_url = f"{settings.frontend_url}/auth/callback?{urlencode({'token': app_token})}"
    response = RedirectResponse(url=redirect_url)
    response.delete_cookie(STATE_COOKIE_NAME, path="/auth")
    return response


@router.get("/me", response_model=DocenteOut, summary="Datos del docente autenticado")
def get_me(usuario: dict = Depends(get_current_user)):
    """Devuelve el email y nombre del docente autenticado a partir del JWT de la app."""
    return DocenteOut(email=usuario["email"], nombre=usuario["nombre"])
