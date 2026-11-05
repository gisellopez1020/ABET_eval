"""
Cifrado simétrico (Fernet: AES-128-CBC + HMAC-SHA256) de lo que se guarda en la base.

- Secretos de Google Drive (refresh_token): clave TOKEN_ENCRYPTION_KEY, con
  `cifrar` / `descifrar`.
- Datos personales del estudiante (RNF-14): clave DATA_ENCRYPTION_KEY, con
  `cifrar_dato` / `descifrar_dato`. De esa clave maestra se deriva con HKDF-SHA256 una
  subclave por propósito, así la misma clave puede servir más adelante para otro fin
  (p. ej. un índice ciego) sin reutilizar bytes. Los valores guardados llevan el
  prefijo `enc:v1:` para distinguirlos del texto plano anterior y permitir rotar
  la clave o el algoritmo (v2) en el futuro.

Las dos claves se validan en config.py. Nunca se registran en logs ni la clave ni
el dato descifrado.
"""
import base64
from functools import lru_cache
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.config import settings
from app.utils.claves import clave_maestra_valida  # noqa: F401 (se reexporta)

PREFIJO_V1 = "enc:v1:"
# Contexto de HKDF: cambiarlo cambia la subclave y deja ilegibles los datos ya cifrados
_INFO_ESTUDIANTES_V1 = b"abet-eval/estudiantes/fernet/v1"


class DatosIlegibles(Exception):
    """
    Hay datos cifrados que no se pueden descifrar: falta DATA_ENCRYPTION_KEY o no es
    la clave con que se cifraron. La capa HTTP responde 503 con este mensaje.
    """


MENSAJE_CLAVE_EQUIVOCADA = (
    "Los datos de los estudiantes están cifrados y DATA_ENCRYPTION_KEY no es la clave "
    "con que se cifraron (cambió o se perdió). Sin la clave original esos datos no se "
    "pueden recuperar. Configura la clave original (ver DESPLIEGUE_PRODUCCION.md)."
)
MENSAJE_SIN_CLAVE = (
    "Los datos de los estudiantes están cifrados pero DATA_ENCRYPTION_KEY no está "
    "configurada. Configura la clave con que se cifraron (ver DESPLIEGUE_PRODUCCION.md)."
)


# ── Secretos de Google Drive (TOKEN_ENCRYPTION_KEY) ──────────────────────────

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


# ── Datos personales del estudiante (DATA_ENCRYPTION_KEY) ────────────────────

def clave_datos_configurada() -> bool:
    """¿Hay DATA_ENCRYPTION_KEY? Sin ella (solo posible con SKIP_AUTH=true) no se cifra."""
    clave = settings.data_encryption_key.strip()
    return bool(clave) and clave != "PLACEHOLDER"


@lru_cache(maxsize=4)
def _fernet_estudiantes(clave_maestra: str) -> Fernet:
    subclave = HKDF(
        algorithm=hashes.SHA256(), length=32, salt=None, info=_INFO_ESTUDIANTES_V1,
    ).derive(base64.urlsafe_b64decode(clave_maestra.encode()))
    return Fernet(base64.urlsafe_b64encode(subclave))


def _fernet_datos() -> Optional[Fernet]:
    if not clave_datos_configurada():
        return None
    return _fernet_estudiantes(settings.data_encryption_key.strip())


def esta_cifrado(valor: Optional[str]) -> bool:
    return bool(valor) and valor.startswith(PREFIJO_V1)


def cifrar_dato(texto: str) -> str:
    """`enc:v1:<token Fernet>`; sin DATA_ENCRYPTION_KEY devuelve el texto tal cual."""
    fernet = _fernet_datos()
    if fernet is None:
        return texto
    return PREFIJO_V1 + fernet.encrypt(texto.encode("utf-8")).decode("ascii")


def descifrar_dato(valor: str) -> str:
    """
    El texto original. Un valor sin prefijo es texto plano anterior al cifrado y se
    devuelve igual. Lanza DatosIlegibles si está cifrado y no hay clave o no es la
    correcta: nunca devuelve el texto cifrado como si fuera el dato.
    """
    if not esta_cifrado(valor):
        return valor
    fernet = _fernet_datos()
    if fernet is None:
        raise DatosIlegibles(MENSAJE_SIN_CLAVE)
    try:
        return fernet.decrypt(valor[len(PREFIJO_V1):].encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        raise DatosIlegibles(MENSAJE_CLAVE_EQUIVOCADA) from None
