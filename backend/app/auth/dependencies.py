import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Cookie, Header, HTTPException, Request, status
from jose import jwt, JWTError

from app.config import settings

MOCK_USER = {
    "email": "profesor.test@uao.edu.co",
    "nombre": "Profesor Test UAO",
}

# El JWT de la app viaja en esta cookie httpOnly (el frontend no puede leerla).
SESSION_COOKIE_NAME = "session"

# Protección CSRF: el JWT lleva un token aleatorio en el claim "csrf"; el frontend
# lo obtiene de GET /auth/me y lo reenvía en este header en cada petición que
# modifica datos. Un sitio ajeno no puede leer /auth/me (CORS) ni forjar el JWT,
# así que no puede adivinar el valor aunque el navegador adjunte la cookie.
CSRF_HEADER = "X-CSRF-Token"
CSRF_CLAIM = "csrf"
METODOS_SEGUROS = frozenset({"GET", "HEAD", "OPTIONS"})


def create_access_token(email: str, nombre: str) -> str:
    """Emite el JWT propio de la app (con su token CSRF) para un docente ya autenticado con Google."""
    expira = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "email": email,
        "nombre": nombre,
        CSRF_CLAIM: secrets.token_urlsafe(32),
        "exp": expira,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decodificar_sesion(token: Optional[str]) -> dict:
    """Valida el JWT de la cookie de sesión y devuelve email, nombre y token CSRF."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No hay una sesión iniciada; inicia sesión con Google",
        )
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Sesión inválida o expirada: {exc}",
        ) from exc

    email = payload.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión inválida: no contiene email del usuario",
        )
    return {
        "email": email,
        "nombre": payload.get("nombre", ""),
        "csrf_token": payload.get(CSRF_CLAIM),
    }


def verificar_csrf(request: Request, usuario: dict, csrf_header: Optional[str]) -> None:
    """En métodos que modifican datos, exige que el header CSRF coincida con el de la sesión."""
    if request.method in METODOS_SEGUROS:
        return
    esperado = usuario.get("csrf_token")
    if not (
        csrf_header
        and esperado
        and secrets.compare_digest(csrf_header.encode(), esperado.encode())
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Falta el header {CSRF_HEADER} o no coincide con la sesión",
        )


def get_current_user(
    request: Request,
    session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    csrf_header: Optional[str] = Header(default=None, alias=CSRF_HEADER),
) -> dict:
    """
    Devuelve el usuario autenticado a partir del JWT de la cookie de sesión.
    En POST/PUT/PATCH/DELETE exige además el header CSRF.
    En modo SKIP_AUTH=true retorna un usuario mock sin cookie ni CSRF.
    """
    if settings.skip_auth:
        return MOCK_USER

    usuario = decodificar_sesion(session)
    verificar_csrf(request, usuario, csrf_header)
    return usuario
