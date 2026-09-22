from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, status
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


class DocenteOut(BaseModel):
    email: str
    nombre: str


@router.get("/login", summary="Redirige a la pantalla de consentimiento de Google")
def login():
    """Inicia el flujo OAuth 2.0 Authorization Code redirigiendo a Google."""
    return RedirectResponse(url=build_authorization_url())


@router.get("/callback", summary="Callback OAuth de Google")
async def callback(code: str = Query(...)):
    """
    Recibe el authorization code de Google, lo intercambia por tokens,
    valida el id_token y emite el JWT propio de la app. Redirige al
    frontend con el JWT como parámetro de consulta.
    """
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
    return RedirectResponse(url=redirect_url)


@router.get("/me", response_model=DocenteOut, summary="Datos del docente autenticado")
def get_me(usuario: dict = Depends(get_current_user)):
    """Devuelve el email y nombre del docente autenticado a partir del JWT de la app."""
    return DocenteOut(email=usuario["email"], nombre=usuario["nombre"])
