import secrets
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.auth.dependencies import (
    CSRF_HEADER,
    SESSION_COOKIE_NAME,
    create_access_token,
    decodificar_sesion,
    get_current_user,
    verificar_csrf,
)
from app.config import settings
from app.services.google_auth import (
    build_authorization_url,
    exchange_code_for_tokens,
    guardar_tokens_drive,
    verify_id_token,
)
from app.utils.urls import es_localhost

router = APIRouter(prefix="/auth", tags=["Autenticación"])

STATE_COOKIE_NAME = "oauth_state"
STATE_COOKIE_MAX_AGE = 300


class DocenteOut(BaseModel):
    email: str
    nombre: str
    # Token que el frontend debe reenviar en el header X-CSRF-Token en las
    # peticiones que modifican datos. None en modo SKIP_AUTH.
    csrf_token: Optional[str] = None


def _atributos_cookie_sesion() -> dict:
    """Atributos de la cookie de sesión; borrarla exige repetir los mismos."""
    return {
        "httponly": True,
        "samesite": "lax",
        # La cookie la pone el host del callback de Google (GOOGLE_REDIRECT_URI)
        "secure": not es_localhost(settings.google_redirect_uri),
        # "/" porque el frontend llama a la API con el prefijo /api del proxy
        "path": "/",
    }


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
        secure=not es_localhost(settings.google_redirect_uri),
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
    valida el id_token y emite el JWT propio de la app en una cookie httpOnly
    de sesión. Redirige al frontend, que confirma la sesión con GET /auth/me.

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
    response = RedirectResponse(url=f"{settings.frontend_url}/auth/callback")
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=app_token,
        max_age=settings.jwt_expire_minutes * 60,
        **_atributos_cookie_sesion(),
    )
    response.delete_cookie(STATE_COOKIE_NAME, path="/auth")
    return response


@router.get("/me", response_model=DocenteOut, summary="Datos del docente autenticado")
def get_me(usuario: dict = Depends(get_current_user)):
    """
    Devuelve el email y nombre del docente autenticado a partir de la cookie de
    sesión, junto con el token CSRF que el frontend debe reenviar en el header
    X-CSRF-Token al modificar datos.
    """
    return DocenteOut(
        email=usuario["email"],
        nombre=usuario["nombre"],
        csrf_token=usuario.get("csrf_token"),
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cierra la sesión borrando la cookie",
)
def logout(
    request: Request,
    session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    csrf_header: Optional[str] = Header(default=None, alias=CSRF_HEADER),
):
    """
    Borra la cookie de sesión (el frontend no puede: es httpOnly).

    Con una sesión válida exige el header CSRF, como cualquier POST, para que
    otro sitio no pueda cerrar la sesión del docente. Si la sesión ya venció o
    no existe, la borra igual: siempre debe poder cerrarse sesión.
    """
    if not settings.skip_auth and session:
        try:
            usuario = decodificar_sesion(session)
        except HTTPException:
            usuario = None
        if usuario:
            verificar_csrf(request, usuario, csrf_header)

    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(SESSION_COOKIE_NAME, **_atributos_cookie_sesion())
    return response
