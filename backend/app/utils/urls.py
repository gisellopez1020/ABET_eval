"""
¿Una URL apunta a la máquina local? Sin dependencias del resto de la app: la usan
config.py (al validar Settings) y routers/auth.py (atributo secure de las cookies).
"""
from urllib.parse import urlparse


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower()


def es_localhost(url: str) -> bool:
    """El host es localhost o 127.0.0.1 (decide el atributo secure de las cookies)."""
    return _host(url) in ("localhost", "127.0.0.1")


def es_host_local(url: str) -> bool:
    """
    El host no es un dominio público: localhost, *.localhost, 127.0.0.1, ::1 o un
    nombre sin punto (frontend, backend: servicios de docker compose).

    Limitación conocida: un servidor de intranet con nombre sin punto
    (http://servidor:5173) también cuenta como local. Una URL sin host
    reconocible (sin esquema, vacía) no cuenta como local.
    """
    host = _host(url)
    if not host:
        return False
    # "::1" no tiene punto: entra por la última condición
    return es_localhost(url) or host.endswith(".localhost") or "." not in host
