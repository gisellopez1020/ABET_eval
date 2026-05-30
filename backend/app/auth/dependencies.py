from typing import Optional
import httpx
from fastapi import Header, HTTPException, status
from jose import jwt, JWTError

from app.config import settings

MOCK_USER = {
    "email": "profesor.test@uao.edu.co",
    "nombre": "Profesor Test UAO",
}

_jwks_cache: Optional[dict] = None


async def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache
    url = (
        f"https://login.microsoftonline.com/{settings.azure_tenant_id}"
        "/discovery/v2.0/keys"
    )
    async with httpx.AsyncClient() as client:
        resp = await client.get(url)
        resp.raise_for_status()
    _jwks_cache = resp.json()
    return _jwks_cache


def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    """
    Devuelve el usuario autenticado a partir del JWT de Microsoft.
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
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")

        import httpx as _httpx
        jwks_url = (
            f"https://login.microsoftonline.com/{settings.azure_tenant_id}"
            "/discovery/v2.0/keys"
        )
        jwks = _httpx.get(jwks_url).json()
        key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
        if not key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido: clave pública no encontrada",
            )

        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=settings.azure_client_id,
        )
        email = payload.get("preferred_username") or payload.get("upn") or payload.get("email")
        nombre = payload.get("name", "")
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
