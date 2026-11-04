"""
¿Una URL apunta a la máquina local? Sin dependencias del resto de la app: la usan
config.py (al validar Settings) y routers/auth.py (atributos de las cookies).
"""
import posixpath
from urllib.parse import urlparse

HOSTS_LOCALHOST = frozenset({"localhost", "127.0.0.1"})

# Pueden ir por http con login real: la máquina local (también ::1) y el servicio del
# frontend en docker compose, que está en el valor por defecto de FRONTEND_ORIGINS
# (http://frontend:5173) y ese valor también se usa con SKIP_AUTH=false
HOSTS_EXENTOS_DE_HTTPS = HOSTS_LOCALHOST | {"::1", "frontend"}


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower()


def es_localhost(url: str) -> bool:
    """El host es localhost o 127.0.0.1 (decide el atributo Secure de las cookies)."""
    return _host(url) in HOSTS_LOCALHOST


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


def puede_ser_http(url: str) -> bool:
    """
    Con login real (SKIP_AUTH=false), ¿esta URL puede ir sin TLS? Solo si su host es
    localhost, 127.0.0.1, ::1 o el servicio `frontend` de docker compose: el tráfico no
    sale de la máquina. Más estricto que es_host_local: un nombre de intranet sin
    punto (http://servidor) sí exige https.
    """
    return urlparse(url).scheme == "https" or _host(url) in HOSTS_EXENTOS_DE_HTTPS


def cookie_segura(url: str) -> bool:
    """
    Atributo Secure de las cookies que pone el host de `url` (GOOGLE_REDIRECT_URI):
    siempre que se use https, y también fuera de localhost aunque se haya escrito http
    (el navegador solo la enviará por https). Solo http://localhost queda sin Secure,
    porque ahí el navegador no la enviaría y el login local dejaría de funcionar.
    """
    return urlparse(url).scheme == "https" or not es_localhost(url)


def ruta_padre(url: str) -> str:
    """
    Directorio de la ruta de `url`: /auth para http://localhost:8000/auth/callback,
    /api/auth para https://dominio/api/auth/callback (detrás del proxy de nginx).
    Es el Path de la cookie oauth_state: debe abarcar la URL del callback tal como la
    ve el navegador, que en modo HTTPS lleva el prefijo /api.
    """
    ruta = posixpath.dirname(urlparse(url).path or "/")
    return ruta if ruta.startswith("/") else "/"
