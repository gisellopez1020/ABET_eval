from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Header, HTTPException, status
from jose import jwt, JWTError

from app.config import settings

MOCK_USER = {
    "email": "profesor.test@uao.edu.co",
    "nombre": "Profesor Test UAO",
}


def create_access_token(email: str, nombre: str) -> str:
    """Emite el JWT propio de la app para un docente ya autenticado con Google."""
    expira = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"email": email, "nombre": nombre, "exp": expira}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    """
    Devuelve el usuario autenticado a partir del JWT propio de la app.
    En modo SKIP_AUTH=true retorna un usuario mock sin validar el token.
    """
    if settings.skip_auth:
        return MOCK_USER

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Se requiere token de autorización (Bearer)",
        )

    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        email = payload.get("email")
        nombre = payload.get("nombre", "")
        if not email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido: no contiene email del usuario",
            )
        return {"email": email, "nombre": nombre}

    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token inválido o expirado: {exc}",
        ) from exc
