"""
SKIP_AUTH=true solo en entornos locales.

Con SKIP_AUTH=true get_current_user devuelve siempre MOCK_USER sin cookie ni CSRF:
cualquiera con acceso de red a la API entra como ese docente. La app no debe
arrancar así si GOOGLE_REDIRECT_URI, FRONTEND_URL o algún origen de
FRONTEND_ORIGINS apunta a un dominio real. Los nombres sin punto (frontend,
backend: servicios de docker compose) cuentan como locales.
"""
import pytest
from pydantic import ValidationError

from app.config import Settings
from app.utils.urls import es_host_local, es_localhost

DOMINIO = "https://abet.uao.edu.co"
CLAVE = "a" * 32
MENSAJE_NUEVO = "SKIP_AUTH=true desactiva el login"
VARIABLES = ("SKIP_AUTH", "JWT_SECRET_KEY", "GOOGLE_REDIRECT_URI", "FRONTEND_URL", "FRONTEND_ORIGINS")


@pytest.fixture(autouse=True)
def entorno_limpio(monkeypatch):
    """Evita que variables de entorno del sistema influyan en los casos."""
    for variable in VARIABLES:
        monkeypatch.delenv(variable, raising=False)


def crear_settings(**kwargs) -> Settings:
    # _env_file=None: ignora el .env local para que el test sea determinista
    return Settings(_env_file=None, **kwargs)


# ── Modo demo apuntando a un dominio real: no arranca ────────────────────────

@pytest.mark.parametrize("variable,campo,valor", [
    ("GOOGLE_REDIRECT_URI", "google_redirect_uri", f"{DOMINIO}/auth/callback"),
    ("FRONTEND_URL", "frontend_url", DOMINIO),
    ("FRONTEND_ORIGINS", "frontend_origins", f"http://localhost:5173,{DOMINIO}"),
])
def test_modo_demo_con_dominio_real_falla_al_arrancar(variable, campo, valor):
    with pytest.raises(ValidationError) as exc:
        crear_settings(skip_auth=True, **{campo: valor})
    mensaje = str(exc.value)
    assert MENSAJE_NUEVO in mensaje
    assert "SKIP_AUTH=false" in mensaje
    assert variable in mensaje


def test_mensaje_nombra_solo_las_variables_que_fallan():
    with pytest.raises(ValidationError) as exc:
        crear_settings(skip_auth=True, frontend_url=DOMINIO)
    mensaje = str(exc.value)
    assert "FRONTEND_URL" in mensaje
    assert "GOOGLE_REDIRECT_URI" not in mensaje and "FRONTEND_ORIGINS" not in mensaje


def test_mensaje_nombra_todas_las_variables_que_fallan():
    with pytest.raises(ValidationError) as exc:
        crear_settings(
            skip_auth=True, google_redirect_uri=f"{DOMINIO}/auth/callback",
            frontend_url=DOMINIO, frontend_origins=DOMINIO,
        )
    assert "GOOGLE_REDIRECT_URI, FRONTEND_URL, FRONTEND_ORIGINS" in str(exc.value)


def test_error_no_expone_las_urls():
    with pytest.raises(ValidationError) as exc:
        crear_settings(skip_auth=True, frontend_url="https://secreto-interno.uao.edu.co")
    assert "secreto-interno" not in str(exc.value)


@pytest.mark.parametrize("origen", ["localhost:5173", "abet.uao.edu.co", "http://"])
def test_url_sin_host_reconocible_falla_al_arrancar(origen):
    with pytest.raises(ValidationError) as exc:
        crear_settings(skip_auth=True, frontend_origins=origen)
    assert MENSAJE_NUEVO in str(exc.value)


def test_variables_de_entorno_tambien_se_validan(monkeypatch):
    monkeypatch.setenv("SKIP_AUTH", "true")
    monkeypatch.setenv("FRONTEND_URL", DOMINIO)
    with pytest.raises(ValidationError) as exc:
        crear_settings()
    assert MENSAJE_NUEVO in str(exc.value)


# ── Modo demo en local: arranca como siempre ─────────────────────────────────

def test_modo_demo_con_valores_por_defecto_arranca():
    config = crear_settings(skip_auth=True)
    assert config.skip_auth is True


def test_modo_demo_con_valores_de_docker_compose_arranca(monkeypatch):
    monkeypatch.setenv("SKIP_AUTH", "true")
    monkeypatch.setenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/callback")
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:5173")
    monkeypatch.setenv("FRONTEND_ORIGINS", "http://localhost:5173,http://frontend:5173")
    assert crear_settings().skip_auth is True


@pytest.mark.parametrize("host", ["127.0.0.1", "[::1]", "app.localhost", "LOCALHOST", "backend"])
def test_modo_demo_con_otros_hosts_locales_arranca(host):
    url = f"http://{host}:5173"
    config = crear_settings(
        skip_auth=True, google_redirect_uri=f"{url}/auth/callback", frontend_url=url, frontend_origins=url,
    )
    assert config.skip_auth is True


# ── Login real: el validador nuevo no exige nada ─────────────────────────────

def test_auth_real_con_dominios_reales_arranca():
    config = crear_settings(
        skip_auth=False, jwt_secret_key=CLAVE, google_redirect_uri=f"{DOMINIO}/auth/callback",
        frontend_url=DOMINIO, frontend_origins=DOMINIO,
    )
    assert config.skip_auth is False


def test_auth_real_con_url_sin_host_no_la_revisa():
    config = crear_settings(skip_auth=False, jwt_secret_key=CLAVE, frontend_url="abet.uao.edu.co")
    assert config.frontend_url == "abet.uao.edu.co"


# ── Orden de los validadores: los errores de siempre no cambian ──────────────

@pytest.mark.parametrize("valor", ["*", "https://a.edu.co,*", "", " , "])
def test_comodin_o_vacio_sigue_fallando_con_el_mensaje_de_cors(valor):
    """Mismo caso que test_auth_cookie.TestCORS.test_comodin_o_vacio_falla_al_arrancar:
    validar_frontend_origins va antes y su mensaje es el que se ve, no el nuevo."""
    with pytest.raises(ValidationError) as exc:
        crear_settings(skip_auth=True, frontend_origins=valor)
    mensaje = str(exc.value)
    assert "FRONTEND_ORIGINS debe ser una lista de orígenes explícitos" in mensaje
    assert MENSAJE_NUEVO not in mensaje


def test_auth_real_con_placeholder_sigue_fallando_por_jwt():
    with pytest.raises(ValidationError) as exc:
        crear_settings(skip_auth=False, frontend_url=DOMINIO)
    mensaje = str(exc.value)
    assert "JWT_SECRET_KEY no está configurada de forma segura" in mensaje
    assert MENSAJE_NUEVO not in mensaje


# ── Funciones de app/utils/urls.py ───────────────────────────────────────────

@pytest.mark.parametrize("url,esperado", [
    ("http://localhost:8000/auth/callback", True),
    ("http://127.0.0.1:8000", True),
    ("https://abet.uao.edu.co/auth/callback", False),
    ("http://frontend:5173", False),   # sin cambios: los nombres sin punto no son localhost
    ("http://[::1]:8000", False),
    ("", False),
])
def test_es_localhost_mantiene_su_comportamiento(url, esperado):
    """Gobierna el atributo secure de las cookies: no debe cambiar."""
    assert es_localhost(url) is esperado


@pytest.mark.parametrize("url,esperado", [
    ("http://localhost:5173", True),
    ("http://127.0.0.1:5173", True),
    ("http://[::1]:5173", True),
    ("http://app.localhost:5173", True),
    ("http://frontend:5173", True),
    ("http://backend:8000", True),
    ("https://abet.uao.edu.co", False),
    ("http://192.168.1.10:5173", False),
    ("http://localhost.evil.example", False),
    ("abet.uao.edu.co", False),
    ("", False),
])
def test_es_host_local(url, esperado):
    assert es_host_local(url) is esperado
