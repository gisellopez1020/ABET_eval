"""
RNF-16: la sesión vence tras 8 h sin actividad, con un tope absoluto de 24 h.

- Cada petición autenticada renueva la cookie (ventana deslizante), pero solo si el
  token tiene al menos 15 minutos: /auth/me no lleva un Set-Cookie en cada respuesta.
- El tope (claim ses_max) se fija en el login y no se extiende.
- La renovación conserva el claim CSRF: el token que el frontend tiene en memoria
  sigue valiendo.
- logout y SKIP_AUTH=true no cambian.

El tiempo se simula sustituyendo app.auth.dependencies._ahora (el mismo reloj con que
se emiten y se validan los tokens): nada de sleep.
"""
import logging
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import jwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.responses import StreamingResponse
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.auth import dependencies
from app.auth.dependencies import CSRF_HEADER, SESSION_COOKIE_NAME, get_current_user
from app.auth.renovacion import RenovarSesion
from app.config import Settings, settings
from app.database import get_db
from app.routers import auth
from tests.test_catalogo_ra_abet import db_session  # noqa: F401 (fixture)

EMAIL = "doc@uao.edu.co"
MENSAJE_401 = "Sesión inválida o expirada; inicia sesión de nuevo"
INICIO = datetime(2026, 3, 2, 7, 0, tzinfo=timezone.utc)

app = FastAPI()
app.include_router(auth.router)
app.add_middleware(RenovarSesion)
ejecutados: list[str] = []


@app.get("/protegido")
def leer(usuario: dict = Depends(get_current_user)):
    return {"email": usuario["email"]}


@app.post("/protegido")
def modificar(usuario: dict = Depends(get_current_user)):
    ejecutados.append("post")
    return {"ok": True}


@app.get("/descarga")
def descarga(usuario: dict = Depends(get_current_user)):
    # Como las exportaciones a Excel: el endpoint devuelve su propio Response
    return StreamingResponse(iter([b"datos"]), media_type="application/octet-stream")


class Reloj:
    def __init__(self) -> None:
        self.ahora = INICIO

    def __call__(self) -> datetime:
        return self.ahora

    def ir_a(self, **delta) -> None:
        """Pone el reloj en INICIO + delta (horas=, minutes=...)."""
        self.ahora = INICIO + timedelta(**delta)


@pytest.fixture
def reloj(monkeypatch):
    r = Reloj()
    monkeypatch.setattr(dependencies, "_ahora", r)
    return r


@pytest.fixture(autouse=True)
def login_real(monkeypatch):
    monkeypatch.setattr(settings, "skip_auth", False)
    monkeypatch.setattr(settings, "jwt_secret_key", "clave-de-pruebas-" + "k" * 48)
    monkeypatch.setattr(settings, "sesion_inactividad_minutos", 8 * 60)
    monkeypatch.setattr(settings, "sesion_duracion_maxima_minutos", 24 * 60)
    ejecutados.clear()


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


def _claims(token: str) -> dict:
    return jwt.decode(token, options={"verify_signature": False})


def _cookies_de_sesion(resp) -> list[str]:
    return [c for c in resp.headers.get_list("set-cookie") if c.startswith(f"{SESSION_COOKIE_NAME}=")]


def _atributos(cookie: str) -> set[str]:
    """Atributos de un Set-Cookie sin el valor ni max-age/expires (cambian en cada emisión)."""
    partes = [p.strip().lower() for p in cookie.split(";")[1:]]
    return {p for p in partes if not p.startswith(("max-age=", "expires="))}


def _max_age(cookie: str) -> int:
    for parte in cookie.split(";"):
        parte = parte.strip().lower()
        if parte.startswith("max-age="):
            return int(parte.removeprefix("max-age="))
    raise AssertionError(f"sin max-age: {cookie}")


def _login(client):
    """Inicia sesión por el callback en el instante actual del reloj. Devuelve la respuesta."""
    client.cookies.set("oauth_state", "st")
    with patch("app.routers.auth.exchange_code_for_tokens", new_callable=AsyncMock) as ex, \
         patch("app.routers.auth.verify_id_token", return_value={"email": EMAIL, "nombre": "Doc"}), \
         patch("app.routers.auth.guardar_tokens_drive"):
        ex.return_value = {"id_token": "x"}
        return client.get("/auth/callback", params={"code": "c", "state": "st"}, follow_redirects=False)


def _token(client) -> str:
    return client.cookies[SESSION_COOKIE_NAME]


class TestInactividad:
    def test_el_login_fija_exp_a_8_h_y_el_tope_a_24_h(self, client, reloj):
        resp = _login(client)
        claims = _claims(_token(client))
        assert claims["iat"] == int(INICIO.timestamp())
        assert claims["exp"] == int((INICIO + timedelta(hours=8)).timestamp())
        assert claims["ses_max"] == int((INICIO + timedelta(hours=24)).timestamp())
        assert _max_age(_cookies_de_sesion(resp)[0]) == 8 * 3600

    def test_sin_actividad_sigue_valida_hasta_justo_antes_de_8_h(self, client, reloj):
        _login(client)
        reloj.ir_a(hours=7, minutes=59, seconds=59)
        assert client.get("/protegido").status_code == 200

    def test_sin_actividad_vence_a_las_8_h(self, client, reloj):
        _login(client)
        reloj.ir_a(hours=8)
        resp = client.get("/protegido")
        assert resp.status_code == 401
        assert resp.json()["detail"] == MENSAJE_401

    def test_vencida_no_filtra_el_motivo_y_lo_deja_en_el_log(self, client, reloj, caplog):
        _login(client)
        reloj.ir_a(hours=9)
        with caplog.at_level(logging.INFO, logger="app.auth.dependencies"):
            resp = client.get("/auth/me")
        assert resp.status_code == 401
        detalle = resp.json()["detail"]
        assert detalle == MENSAJE_401
        for texto in ("inactividad", "tope", "ses_max", "Signature", "iat"):
            assert texto not in detalle
        assert _cookies_de_sesion(resp) == []  # una sesión vencida no se renueva
        assert "vencida por inactividad" in caplog.text

    def test_la_actividad_la_extiende_mas_alla_de_8_h(self, client, reloj):
        _login(client)
        # Una petición cada hora durante 12 h: nunca vence
        for hora in range(1, 13):
            reloj.ir_a(hours=hora)
            assert client.get("/protegido").status_code == 200, f"hora {hora}"
        # La última petición (12 h) la renovó hasta las 20 h: a las 8 h de ella vence
        assert _claims(_token(client))["exp"] == int((INICIO + timedelta(hours=20)).timestamp())
        reloj.ir_a(hours=20)
        assert client.get("/auth/me").status_code == 401

    def test_peor_caso_vence_7_h_45_min_tras_la_ultima_peticion(self, client, reloj):
        # La última petición llega 14 min 59 s después del login: no renueva (no tiene
        # 15 min), así que la sesión vence a las 8 h del login, 7 h 45 min 1 s después
        # de esa petición. Es el mínimo de la ventana; el máximo son 8 h.
        _login(client)
        reloj.ir_a(minutes=14, seconds=59)
        resp = client.get("/protegido")
        assert resp.status_code == 200
        assert _cookies_de_sesion(resp) == []
        reloj.ir_a(hours=8)
        assert client.get("/protegido").status_code == 401


class TestRenovacion:
    def test_no_renueva_antes_de_15_min(self, client, reloj):
        _login(client)
        token_login = _token(client)
        reloj.ir_a(minutes=14, seconds=59)
        resp = client.get("/auth/me")
        assert resp.status_code == 200
        assert _cookies_de_sesion(resp) == []
        assert _token(client) == token_login

    def test_renueva_a_los_15_min_con_8_h_mas(self, client, reloj):
        _login(client)
        reloj.ir_a(minutes=15)
        resp = client.get("/auth/me")
        [cookie] = _cookies_de_sesion(resp)
        claims = _claims(_token(client))
        assert claims["iat"] == int(reloj.ahora.timestamp())
        assert claims["exp"] == int((reloj.ahora + timedelta(hours=8)).timestamp())
        assert _max_age(cookie) == 8 * 3600

    def test_mismos_atributos_que_la_cookie_del_login(self, client, reloj):
        [del_login] = _cookies_de_sesion(_login(client))
        reloj.ir_a(hours=1)
        [renovada] = _cookies_de_sesion(client.get("/protegido"))
        assert _atributos(renovada) == _atributos(del_login)
        assert {"httponly", "samesite=lax", "path=/"} <= _atributos(renovada)
        assert "secure" not in _atributos(renovada)  # GOOGLE_REDIRECT_URI es localhost

    def test_secure_en_modo_https_tambien_al_renovar(self, client, reloj, monkeypatch):
        monkeypatch.setattr(settings, "google_redirect_uri", "https://abet.uao.edu.co/api/auth/callback")
        [del_login] = _cookies_de_sesion(_login(client))
        reloj.ir_a(hours=1)
        # El cliente de pruebas habla http: se reenvía la cookie a mano (el navegador
        # la mandaría por https)
        token = del_login.split(";")[0].split("=", 1)[1]
        client.cookies.clear()
        client.cookies.set(SESSION_COOKIE_NAME, token)
        [renovada] = _cookies_de_sesion(client.get("/protegido"))
        assert "secure" in _atributos(renovada)
        assert _atributos(renovada) == _atributos(del_login)

    def test_conserva_el_csrf(self, client, reloj):
        _login(client)
        csrf = client.get("/auth/me").json()["csrf_token"]
        reloj.ir_a(hours=2)
        assert _cookies_de_sesion(client.get("/protegido"))  # renovó
        assert _claims(_token(client))["csrf"] == csrf
        assert client.get("/auth/me").json()["csrf_token"] == csrf
        # El token CSRF que el frontend tenía en memoria sigue sirviendo para modificar
        assert client.post("/protegido", headers={CSRF_HEADER: csrf}).status_code == 200
        assert ejecutados == ["post"]

    def test_un_post_sin_csrf_no_renueva(self, client, reloj):
        _login(client)
        reloj.ir_a(hours=2)
        resp = client.post("/protegido")
        assert resp.status_code == 403
        assert _cookies_de_sesion(resp) == []

    def test_tambien_en_descargas_que_devuelven_su_propio_response(self, client, reloj):
        _login(client)
        reloj.ir_a(hours=1)
        resp = client.get("/descarga")
        assert resp.content == b"datos"
        assert len(_cookies_de_sesion(resp)) == 1

    def test_la_app_real_tiene_el_middleware(self):
        from main import app as app_real
        assert RenovarSesion in [m.cls for m in app_real.user_middleware]


class TestTopeAbsoluto:
    def test_con_actividad_continua_vence_a_las_24_h(self, client, reloj):
        _login(client)
        for hora in range(1, 24):
            reloj.ir_a(hours=hora)
            assert client.get("/protegido").status_code == 200, f"hora {hora}"
        reloj.ir_a(hours=23, minutes=59, seconds=59)
        assert client.get("/protegido").status_code == 200
        reloj.ir_a(hours=24)
        resp = client.get("/protegido")
        assert resp.status_code == 401
        assert resp.json()["detail"] == MENSAJE_401

    def test_el_tope_no_cambia_y_exp_nunca_lo_pasa(self, client, reloj):
        _login(client)
        tope = _claims(_token(client))["ses_max"]
        for hora in range(1, 24):
            reloj.ir_a(hours=hora)
            client.get("/protegido")
            claims = _claims(_token(client))
            assert claims["ses_max"] == tope
            assert claims["exp"] <= tope

    def test_cerca_del_tope_la_cookie_dura_lo_que_falta(self, client, reloj):
        _login(client)
        for hora in (6, 12):  # exp queda en 20 h
            reloj.ir_a(hours=hora)
            client.get("/protegido")
        reloj.ir_a(hours=17)  # 17 h + 8 h pasaría del tope: se recorta a las 24 h
        [cookie] = _cookies_de_sesion(client.get("/protegido"))
        assert _max_age(cookie) == 7 * 3600
        assert _claims(_token(client))["exp"] == _claims(_token(client))["ses_max"]
        # Ya no se puede extender: no hay más renovaciones hasta el tope
        reloj.ir_a(hours=18)
        assert _cookies_de_sesion(client.get("/protegido")) == []

    def test_un_exp_firmado_mas_alla_del_tope_se_rechaza(self, client, reloj):
        ahora = int(INICIO.timestamp())
        token = jwt.encode(
            {"email": EMAIL, "csrf": "c", "iat": ahora, "exp": ahora + 30 * 3600, "ses_max": ahora + 3600},
            settings.jwt_secret_key, algorithm="HS256",
        )
        client.cookies.set(SESSION_COOKIE_NAME, token)
        assert client.get("/protegido").status_code == 401

    @pytest.mark.parametrize("falta", ["ses_max", "iat"])
    def test_token_sin_tope_o_sin_iat_anterior_a_la_1_0_0_es_401(self, client, reloj, falta):
        # Los tokens emitidos antes de esta versión no traen ses_max: el docente
        # inicia sesión una vez más
        ahora = int(INICIO.timestamp())
        claims = {"email": EMAIL, "csrf": "c", "iat": ahora, "exp": ahora + 3600, "ses_max": ahora + 7200}
        del claims[falta]
        client.cookies.set(SESSION_COOKIE_NAME, jwt.encode(claims, settings.jwt_secret_key, algorithm="HS256"))
        resp = client.get("/protegido")
        assert resp.status_code == 401
        assert resp.json()["detail"] == MENSAJE_401

    @pytest.mark.parametrize("valor", ["mañana", True, None])
    def test_tope_no_numerico_es_401(self, client, reloj, valor):
        ahora = int(INICIO.timestamp())
        claims = {"email": EMAIL, "csrf": "c", "iat": ahora, "exp": ahora + 3600, "ses_max": valor}
        client.cookies.set(SESSION_COOKIE_NAME, jwt.encode(claims, settings.jwt_secret_key, algorithm="HS256"))
        assert client.get("/protegido").status_code == 401


class TestSinCambios:
    def test_logout_solo_borra_la_cookie(self, client, reloj):
        _login(client)
        csrf = client.get("/auth/me").json()["csrf_token"]
        reloj.ir_a(hours=2)  # le tocaría renovar: logout no debe hacerlo
        resp = client.post("/auth/logout", headers={CSRF_HEADER: csrf})
        assert resp.status_code == 204
        [cookie] = _cookies_de_sesion(resp)
        assert "max-age=0" in cookie.lower()
        assert client.get("/auth/me").status_code == 401

    def test_skip_auth_no_pone_cookies(self, client, reloj, monkeypatch):
        monkeypatch.setattr(settings, "skip_auth", True)
        reloj.ir_a(hours=30)
        resp = client.get("/protegido")
        assert resp.status_code == 200
        assert _cookies_de_sesion(resp) == []


class TestConfiguracion:
    def _settings(self, **kw):
        return Settings(_env_file=None, skip_auth=True, **kw)

    def test_valores_por_defecto(self):
        s = self._settings()
        assert (s.sesion_inactividad_minutos, s.sesion_duracion_maxima_minutos) == (480, 1440)

    def test_tope_menor_que_la_inactividad_no_arranca(self):
        with pytest.raises(ValidationError) as exc:
            self._settings(sesion_inactividad_minutos=600, sesion_duracion_maxima_minutos=300)
        assert "no puede ser menor que SESION_INACTIVIDAD_MINUTOS" in str(exc.value)

    def test_tope_igual_a_la_inactividad_arranca(self):
        self._settings(sesion_inactividad_minutos=480, sesion_duracion_maxima_minutos=480)

    @pytest.mark.parametrize("campo", ["sesion_inactividad_minutos", "sesion_duracion_maxima_minutos"])
    @pytest.mark.parametrize("valor", [0, -5])
    def test_cero_o_negativo_no_arranca(self, campo, valor):
        with pytest.raises(ValidationError) as exc:
            self._settings(**{campo: valor})
        assert "mayores que 0" in str(exc.value)

    def test_tope_de_mas_de_7_dias_no_arranca(self):
        with pytest.raises(ValidationError) as exc:
            self._settings(sesion_duracion_maxima_minutos=7 * 24 * 60 + 1)
        assert "7 días" in str(exc.value)

    def test_variables_de_entorno(self, monkeypatch):
        monkeypatch.setenv("SESION_INACTIVIDAD_MINUTOS", "60")
        monkeypatch.setenv("SESION_DURACION_MAXIMA_MINUTOS", "120")
        s = self._settings()
        assert (s.sesion_inactividad_minutos, s.sesion_duracion_maxima_minutos) == (60, 120)

    def test_jwt_expire_minutes_antigua_no_impide_arrancar_pero_avisa(self, caplog):
        with caplog.at_level(logging.WARNING, logger="app.config"):
            s = self._settings(jwt_expire_minutes=1440)
        assert s.sesion_inactividad_minutos == 480
        assert "JWT_EXPIRE_MINUTES está obsoleta" in caplog.text
