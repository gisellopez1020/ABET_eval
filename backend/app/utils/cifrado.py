"""
Cifrado simétrico (Fernet) de secretos que se guardan en la base de datos, como el
refresh_token de Google Drive. La clave es TOKEN_ENCRYPTION_KEY (validada en config.py).
"""
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _fernet() -> Fernet:
    return Fernet(settings.token_encryption_key.strip().encode())


def cifrar(texto: str) -> str:
    return _fernet().encrypt(texto.encode()).decode()


def descifrar(cifrado: str) -> Optional[str]:
    """None si no se puede descifrar (otra clave, o el valor está dañado)."""
    try:
        return _fernet().decrypt(cifrado.encode()).decode()
    except (InvalidToken, ValueError):
        return None
