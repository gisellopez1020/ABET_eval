"""
Formato de las claves de cifrado. Sin dependencias del resto de la app: lo usan
config.py (al validar Settings) y utils/cifrado.py.
"""
import base64
import binascii

LONGITUD_CLAVE_DATOS = 32


def clave_maestra_valida(clave: str) -> bool:
    """Base64 urlsafe de exactamente 32 bytes (como Fernet.generate_key())."""
    try:
        # validate=True: un carácter fuera del alfabeto es un error, no se descarta
        crudo = base64.b64decode(clave.strip().encode(), altchars=b"-_", validate=True)
        return len(crudo) == LONGITUD_CLAVE_DATOS
    except (binascii.Error, ValueError):
        return False
