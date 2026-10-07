"""
Sesión en cookie httpOnly + protección CSRF + logout + CORS configurable.

- El callback pone el JWT en la cookie `session` (httpOnly, SameSite=Lax, path=/,
  Secure fuera de localhost) y no en la URL.
- get_current_user lee la cookie (ya no el header Authorization) y en
  POST/PUT/PATCH/DELETE exige X-CSRF-Token igual al claim "csrf" del JWT.
- POST /auth/logout borra la cookie.
- CORS toma los orígenes de FRONTEND_ORIGINS y rechaza "*".
Con SKIP_AUTH=true no se exige cookie ni CSRF.
"""
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import Depends, FastAPI
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.auth.dependencies import (
    CSRF_HEADER,
    SESSION_COOKIE_NAME,
    create_access_token,
    get_current_user,
)
from app.config import Settings, settings
from app.routers import auth

EMAIL = "doc@uao.edu.co"

# App mínima: el router de auth real + endpoints protegidos que registran si se ejecutaron
app = FastAPI()
app.include_router(auth.router)
ejecutados: list[str] = []


@app.get("/protegido")
def leer(usuario: dict = Depends(get_current_user)):
    return {"email": usuario["email"]}


@app.post("/protegido")
def crear(usuario: dict = Depends(get_current_user)):
    ejecutados.append("post")
    return {"ok": True}


@app.delete("/protegido")
def borrar(usuario: dict = Depends(get_current_user)):
    ejecutados.append("delete")
    return {"ok": True}


@pytest.fixture(autouse=True)
def login_real(monkeypatch):
    monkeypatch.setattr(settings, "skip_auth", False)
    ejecutados.clear()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _csrf_de(token: str) -> str:
    from jose import jwt
    return jwt.get_unverified_claims(token)["csrf"]


def _set_cookie(resp, nombre: str) -> str:
    return next(c for c in resp.headers.get_list("set-cookie") if c.startswith(f"{nombre}="))


def _callback(client):
    client.cookies.set("oauth_state", "st")
    with patch("app.routers.auth.exchange_code_for_tokens", new_callable=AsyncMock) as ex, \
         patch("app.routers.auth.verify_id_token", return_value={"email": EMAIL, "nombre": "Doc"}), \
         patch("app.routers.auth.guardar_tokens_drive"):
        ex.return_value = {"id_token": "x"}
        return client.get("/auth/callback", params={"code": "c", "state": "st"}, follow_redirects=False)


@pytest.fixture
def sesion(client):
    """Inicia sesión por el callback (la cookie la pone la respuesta, como en el navegador).

    Devuelve el token CSRF de esa sesión.
    """
    token = _callback(client).cookies[SESSION_COOKIE_NAME]
    return _csrf_de(token)


class TestCallbackPoneCookie:
    def test_cookie_httponly_lax_path_raiz_y_sin_token_en_la_url(self, client):
        resp = _callback(client)
        assert resp.headers["location"] == f"{settings.frontend_url}/auth/callback"
        cookie = _set_cookie(resp, SESSION_COOKIE_NAME).lower()
        assert "httponly" in cookie
        assert "samesite=lax" in cookie
        assert "path=/;" in cookie or cookie.endswith("path=/")
        assert f"max-age={settings.jwt_expire_minutes * 60}" in cookie
        assert "secure" not in cookie  # GOOGLE_REDIRECT_URI es localhost

    def test_secure_fuera_de_localhost(self, client, monkeypatch):
        monkeypatch.setattr(settings, "google_redirect_uri", "https://abet.uao.edu.co/api/auth/callback")
        cookie = _set_cookie(_callback(client), SESSION_COOKIE_NAME).lower()
        assert "secure" in cookie

    def test_la_cookie_del_callback_autentica_me(self, client):
        token = _callback(client).cookies[SESSION_COOKIE_NAME]
        client.cookies.clear()
        client.cookies.set(SESSION_COOKIE_NAME, token)
        resp = client.get("/auth/me")
        assert resp.status_code == 200
        assert resp.json() == {"email": EMAIL, "nombre": "Doc", "csrf_token": _csrf_de(token)}


class TestSesionPorCookie:
    def test_me_sin_cookie_401(self, client):
        assert client.get("/auth/me").status_code == 401

    def test_me_con_jwt_invalido_401(self, client):
        client.cookies.set(SESSION_COOKIE_NAME, "no-es-un-jwt")
        assert client.get("/auth/me").status_code == 401

    def test_me_con_jwt_firmado_con_otra_clave_401(self, client, monkeypatch):
        monkeypatch.setattr(settings, "jwt_secret_key", "otra-clave-" + "x" * 32)
        token = create_access_token(EMAIL, "Doc")
        monkeypatch.undo()
        monkeypatch.setattr(settings, "skip_auth", False)
        client.cookies.set(SESSION_COOKIE_NAME, token)
        assert client.get("/auth/me").status_code == 401

    def test_header_authorization_ya_no_autentica(self, client):
        token = create_access_token(EMAIL, "Doc")
        resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401

    def test_cada_sesion_tiene_su_propio_token_csrf(self):
        assert _csrf_de(create_access_token(EMAIL, "Doc")) != _csrf_de(create_access_token(EMAIL, "Doc"))


class TestCSRF:
    def test_get_no_exige_header(self, client, sesion):
        assert client.get("/protegido").json() == {"email": EMAIL}

    @pytest.mark.parametrize("metodo", ["post", "delete"])
    def test_sin_header_403_y_no_se_ejecuta(self, client, sesion, metodo):
        resp = getattr(client, metodo)("/protegido")
        assert resp.status_code == 403
        assert CSRF_HEADER in resp.json()["detail"]
        assert ejecutados == []

    def test_header_incorrecto_403(self, client, sesion):
        resp = client.post("/protegido", headers={CSRF_HEADER: "adivinado"})
        assert resp.status_code == 403
        assert ejecutados == []

    def test_token_csrf_de_otra_sesion_403(self, client, sesion):
        otro = _csrf_de(create_access_token("otro@uao.edu.co", "Otro"))
        assert client.post("/protegido", headers={CSRF_HEADER: otro}).status_code == 403

    def test_header_con_caracteres_no_ascii_403(self, client, sesion):
        assert client.post("/protegido", headers={CSRF_HEADER: "ñ".encode()}).status_code == 403

    def test_header_correcto_pasa(self, client, sesion):
        resp = client.post("/protegido", headers={CSRF_HEADER: sesion})
        assert resp.status_code == 200
        assert ejecutados == ["post"]

    def test_jwt_sin_claim_csrf_no_puede_modificar(self, client, monkeypatch):
        from jose import jwt
        token = jwt.encode({"email": EMAIL, "nombre": "Doc"}, settings.jwt_secret_key, algorithm="HS256")
        client.cookies.set(SESSION_COOKIE_NAME, token)
        assert client.post("/protegido", headers={CSRF_HEADER: ""}).status_code == 403
        assert client.post("/protegido", headers={CSRF_HEADER: "None"}).status_code == 403

    def test_sin_cookie_es_401_aunque_traiga_header(self, client):
        assert client.post("/protegido", headers={CSRF_HEADER: "x"}).status_code == 401


class TestLogout:
    def test_borra_la_cookie_y_la_siguiente_peticion_no_autentica(self, client, sesion):
        assert client.get("/auth/me").status_code == 200
        resp = client.post("/auth/logout", headers={CSRF_HEADER: sesion})
        assert resp.status_code == 204
        cookie = _set_cookie(resp, SESSION_COOKIE_NAME).lower()
        assert "max-age=0" in cookie and "path=/" in cookie and "httponly" in cookie
        assert SESSION_COOKIE_NAME not in client.cookies
        assert client.get("/auth/me").status_code == 401

    def test_con_sesion_valida_exige_csrf(self, client, sesion):
        resp = client.post("/auth/logout")
        assert resp.status_code == 403
        assert client.get("/auth/me").status_code == 200  # la sesión sigue viva

    def test_sin_sesion_o_con_sesion_vencida_responde_204(self, client):
        assert client.post("/auth/logout").status_code == 204
        client.cookies.set(SESSION_COOKIE_NAME, "jwt-vencido-o-invalido")
        resp = client.post("/auth/logout")
        assert resp.status_code == 204
        assert "max-age=0" in _set_cookie(resp, SESSION_COOKIE_NAME).lower()

    def test_logout_es_post(self, client, sesion):
        assert client.get("/auth/logout").status_code == 405


class TestModoSkipAuth:
    def test_no_exige_cookie_ni_csrf(self, client, monkeypatch):
        monkeypatch.setattr(settings, "skip_auth", True)
        assert client.get("/auth/me").json()["csrf_token"] is None
        assert client.post("/protegido").status_code == 200
        assert client.post("/auth/logout").status_code == 204


def _dependencias(dependant):
    for d in dependant.dependencies:
        yield d.call
        yield from _dependencias(d)


def test_toda_ruta_que_modifica_datos_pasa_por_get_current_user():
    """Si una ruta nueva olvida Depends(get_current_user), quedaría sin sesión ni CSRF."""
    from main import app as app_real

    sin_proteccion = [
        (sorted(r.methods), r.path)
        for r in app_real.routes
        if isinstance(r, APIRoute)
        and r.methods - {"GET", "HEAD", "OPTIONS"}
        and r.path != "/auth/logout"  # valida la sesión y el CSRF por su cuenta
        and get_current_user not in set(_dependencias(r.dependant))
    ]
    assert sin_proteccion == []


class TestCORS:
    def test_lista_desde_texto_separado_por_comas(self):
        s = Settings(
            _env_file=None, skip_auth=False, jwt_secret_key="a" * 32,
            frontend_origins=" https://a.edu.co , https://b.edu.co ,",
        )
        assert s.lista_frontend_origins == ["https://a.edu.co", "https://b.edu.co"]

    def test_valor_por_defecto(self):
        s = Settings(_env_file=None, skip_auth=True)
        assert s.lista_frontend_origins == ["http://localhost:5173", "http://frontend:5173"]

    @pytest.mark.parametrize("valor", ["*", "https://a.edu.co,*", "", " , "])
    def test_comodin_o_vacio_falla_al_arrancar(self, valor):
        with pytest.raises(ValidationError) as exc:
            Settings(_env_file=None, skip_auth=True, frontend_origins=valor)
        assert "FRONTEND_ORIGINS" in str(exc.value)

    def test_main_usa_la_variable_de_entorno(self):
        backend = Path(__file__).resolve().parents[1]
        codigo = (
            "import main\n"
            "from starlette.middleware.cors import CORSMiddleware\n"
            "m = next(m for m in main.app.user_middleware if m.cls is CORSMiddleware)\n"
            "print(m.kwargs['allow_origins'])\n"
        )
        env = {
            **os.environ, "SKIP_AUTH": "false", "JWT_SECRET_KEY": "a" * 32,
            "FRONTEND_ORIGINS": "https://abet.uao.edu.co",
        }
        salida = subprocess.run(
            [sys.executable, "-c", codigo], cwd=backend, env=env,
            capture_output=True, text=True, check=True,
        ).stdout
        assert salida.strip() == "['https://abet.uao.edu.co']"

    def test_preflight_solo_para_origenes_permitidos(self):
        from main import app as app_real
        with TestClient(app_real) as c:
            pedir = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": CSRF_HEADER}
            ok = c.options("/cursos", headers={"Origin": "http://localhost:5173", **pedir})
            assert ok.headers["access-control-allow-origin"] == "http://localhost:5173"
            assert ok.headers["access-control-allow-credentials"] == "true"
            malo = c.options("/cursos", headers={"Origin": "https://evil.example", **pedir})
            assert "access-control-allow-origin" not in malo.headers
