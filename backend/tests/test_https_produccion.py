"""
RNF-13: comunicación por HTTPS.

- Con login real (SKIP_AUTH=false), GOOGLE_REDIRECT_URI, FRONTEND_URL y cada origen
  de FRONTEND_ORIGINS deben ser https:// salvo localhost, 127.0.0.1, ::1 y el
  servicio `frontend` de docker compose. El .env local (todo en localhost) sigue
  arrancando igual.
- La cookie oauth_state lleva el Path del callback tal como lo ve el navegador
  (/api/auth detrás de nginx) y Secure siempre que el callback sea https.
- API_DOCS=false quita /docs, /redoc y /openapi.json (solo lo usa el modo HTTPS).
"""
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from cryptography.fernet import Fernet
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings, settings
from app.database import get_db
from app.routers import auth
from app.utils.urls import cookie_segura, puede_ser_http, ruta_padre
from tests.test_catalogo_ra_abet import db_session  # noqa: F401 (fixture)

BACKEND = Path(__file__).resolve().parents[1]
DOMINIO = "https://abet.uao.edu.co"
VARIABLES = (
    "SKIP_AUTH", "JWT_SECRET_KEY", "TOKEN_ENCRYPTION_KEY", "DATA_ENCRYPTION_KEY", "GOOGLE_REDIRECT_URI",
    "FRONTEND_URL", "FRONTEND_ORIGINS", "API_DOCS",
)
MENSAJE = "debe usar https:// con SKIP_AUTH=false"


@pytest.fixture(autouse=True)
def entorno_limpio(monkeypatch):
    for variable in VARIABLES:
        monkeypatch.delenv(variable, raising=False)


def settings_produccion(**kwargs) -> Settings:
    """Settings con login real y secretos válidos: aquí solo se prueban las URLs."""
    kwargs.setdefault("skip_auth", False)
    kwargs.setdefault("jwt_secret_key", "a" * 32)
    kwargs.setdefault("token_encryption_key", Fernet.generate_key().decode())
    kwargs.setdefault("data_encryption_key", Fernet.generate_key().decode())
    return Settings(_env_file=None, **kwargs)


# ── Validador de https con SKIP_AUTH=false ───────────────────────────────────

class TestValidadorHttps:
    def test_valores_por_defecto_arrancan_con_login_real(self):
        """El .env local con SKIP_AUTH=false (manual del profesor) no se rompe.

        El valor por defecto de FRONTEND_ORIGINS trae http://frontend:5173: por eso
        el nombre exacto `frontend` está exento.
        """
        s = settings_produccion()
        assert "http://frontend:5173" in s.lista_frontend_origins
        assert s.google_redirect_uri.startswith("http://localhost")

    def test_todo_https_en_un_dominio_arranca(self):
        settings_produccion(
            google_redirect_uri=f"{DOMINIO}/api/auth/callback",
            frontend_url=DOMINIO,
            frontend_origins=DOMINIO,
        )

    @pytest.mark.parametrize("variable,campo,valor", [
        ("GOOGLE_REDIRECT_URI", "google_redirect_uri", "http://abet.uao.edu.co/api/auth/callback"),
        ("FRONTEND_URL", "frontend_url", "http://abet.uao.edu.co"),
        ("FRONTEND_ORIGINS", "frontend_origins", "https://abet.uao.edu.co,http://abet.uao.edu.co"),
    ])
    def test_http_en_un_dominio_no_arranca(self, variable, campo, valor):
        with pytest.raises(ValidationError) as exc:
            settings_produccion(**{campo: valor})
        mensaje = str(exc.value)
        assert MENSAJE in mensaje
        assert variable in mensaje
        assert "DESPLIEGUE_PRODUCCION.md" in mensaje

    def test_mensaje_nombra_solo_las_variables_que_fallan(self):
        with pytest.raises(ValidationError) as exc:
            settings_produccion(frontend_url="http://abet.uao.edu.co")
        mensaje = str(exc.value)
        assert "FRONTEND_URL" in mensaje
        assert "GOOGLE_REDIRECT_URI" not in mensaje and "FRONTEND_ORIGINS" not in mensaje

    @pytest.mark.parametrize("host", ["localhost", "127.0.0.1", "[::1]", "LOCALHOST"])
    def test_maquina_local_puede_ir_por_http(self, host):
        settings_produccion(
            google_redirect_uri=f"http://{host}:8000/auth/callback",
            frontend_url=f"http://{host}:5173",
            frontend_origins=f"http://{host}:5173",
        )

    @pytest.mark.parametrize("url", [
        "http://servidor:5173",          # nombre de intranet sin punto: no está exento
        "http://backend:8000",           # solo `frontend` está exento, por el valor por defecto
        "http://app.localhost:5173",
        "http://192.168.1.10:5173",
        "http://localhost.evil.example",
    ])
    def test_otros_hosts_por_http_no_arrancan(self, url):
        with pytest.raises(ValidationError) as exc:
            settings_produccion(frontend_url=url)
        assert MENSAJE in str(exc.value)

    def test_con_skip_auth_no_aplica(self):
        """En modo demo manda validar_skip_auth_solo_local (todo local de todos modos)."""
        Settings(_env_file=None, skip_auth=True, frontend_url="http://servidor:5173")

    def test_un_secreto_inseguro_se_reporta_antes(self):
        with pytest.raises(ValidationError) as exc:
            settings_produccion(jwt_secret_key="PLACEHOLDER", frontend_url="http://abet.uao.edu.co")
        mensaje = str(exc.value)
        assert "JWT_SECRET_KEY" in mensaje
        assert MENSAJE not in mensaje


# ── Funciones de app/utils/urls.py ───────────────────────────────────────────

@pytest.mark.parametrize("url,esperado", [
    ("https://abet.uao.edu.co", True),
    ("https://servidor", True),
    ("http://localhost:5173", True),
    ("http://127.0.0.1:8000", True),
    ("http://[::1]:5173", True),
    ("http://frontend:5173", True),
    ("http://abet.uao.edu.co", False),
    ("http://servidor", False),
    ("http://frontend.uao.edu.co", False),
    ("", False),
])
def test_puede_ser_http(url, esperado):
    assert puede_ser_http(url) is esperado


@pytest.mark.parametrize("url,esperado", [
    ("http://localhost:8000/auth/callback", False),
    ("https://localhost/api/auth/callback", True),   # antes salía sin Secure
    ("https://abet.uao.edu.co/api/auth/callback", True),
    ("http://abet.uao.edu.co/auth/callback", True),
])
def test_cookie_segura(url, esperado):
    assert cookie_segura(url) is esperado


@pytest.mark.parametrize("url,esperado", [
    ("http://localhost:8000/auth/callback", "/auth"),
    ("https://abet.uao.edu.co/api/auth/callback", "/api/auth"),
    ("https://abet.uao.edu.co/callback", "/"),
    ("https://abet.uao.edu.co", "/"),
])
def test_ruta_padre(url, esperado):
    assert ruta_padre(url) == esperado


# ── Cookies del flujo OAuth detrás de nginx ──────────────────────────────────

app = FastAPI()
app.include_router(auth.router)


@pytest.fixture
def client(db_session, monkeypatch):
    monkeypatch.setattr(settings, "skip_auth", False)
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


def _set_cookie(resp, nombre: str) -> str:
    return next(c for c in resp.headers.get_list("set-cookie") if c.startswith(f"{nombre}=")).lower()


def _callback(client):
    client.cookies.set("oauth_state", "st")
    with patch("app.routers.auth.exchange_code_for_tokens", new_callable=AsyncMock) as ex, \
         patch("app.routers.auth.verify_id_token", return_value={"email": "doc@uao.edu.co", "nombre": "Doc"}), \
         patch("app.routers.auth.guardar_tokens_drive"):
        ex.return_value = {"id_token": "x"}
        return client.get("/auth/callback", params={"code": "c", "state": "st"}, follow_redirects=False)


class TestCookiesDetrasDeNginx:
    def test_local_sin_cambios(self, client):
        """http://localhost:8000/auth/callback: Path=/auth y sin Secure, como antes."""
        cookie = _set_cookie(client.get("/auth/login", follow_redirects=False), "oauth_state")
        assert "path=/auth" in cookie and "path=/api" not in cookie
        assert "secure" not in cookie
        assert "httponly" in cookie and "samesite=lax" in cookie

    def test_modo_https_path_con_prefijo_api_y_secure(self, client, monkeypatch):
        monkeypatch.setattr(settings, "google_redirect_uri", "https://localhost/api/auth/callback")
        cookie = _set_cookie(client.get("/auth/login", follow_redirects=False), "oauth_state")
        assert "path=/api/auth" in cookie
        assert "secure" in cookie

    def test_la_url_de_google_lleva_el_callback_con_api(self, client, monkeypatch):
        monkeypatch.setattr(settings, "google_redirect_uri", f"{DOMINIO}/api/auth/callback")
        destino = client.get("/auth/login", follow_redirects=False).headers["location"]
        assert "redirect_uri=https%3A%2F%2Fabet.uao.edu.co%2Fapi%2Fauth%2Fcallback" in destino

    def test_callback_borra_oauth_state_con_el_mismo_path(self, client, monkeypatch):
        """Si el Path no coincide, el navegador no la borra y queda colgada."""
        monkeypatch.setattr(settings, "google_redirect_uri", "https://localhost/api/auth/callback")
        resp = _callback(client)
        state = _set_cookie(resp, "oauth_state")
        assert "max-age=0" in state and "path=/api/auth" in state and "secure" in state

    def test_cookie_de_sesion_secure_con_https_localhost(self, client, monkeypatch):
        monkeypatch.setattr(settings, "google_redirect_uri", "https://localhost/api/auth/callback")
        sesion = _set_cookie(_callback(client), "session")
        assert "secure" in sesion and "httponly" in sesion
        assert "path=/;" in sesion or sesion.endswith("path=/")


# ── API_DOCS ─────────────────────────────────────────────────────────────────

def _rutas_de_documentacion(**entorno) -> str:
    codigo = (
        "from fastapi.testclient import TestClient\n"
        "import main\n"
        "c = TestClient(main.app)\n"
        "print([c.get(r).status_code for r in ('/docs', '/redoc', '/openapi.json')])\n"
    )
    env = {**os.environ, "SKIP_AUTH": "true", **entorno}
    return subprocess.run(
        [sys.executable, "-c", codigo], cwd=BACKEND, env=env,
        capture_output=True, text=True, check=True,
    ).stdout.strip()


def test_documentacion_activa_por_defecto():
    """Swagger sigue disponible en local (el TG lo cita como documentación de la API)."""
    assert _rutas_de_documentacion() == "[200, 200, 200]"


def test_api_docs_false_quita_la_documentacion():
    assert _rutas_de_documentacion(API_DOCS="false") == "[404, 404, 404]"
