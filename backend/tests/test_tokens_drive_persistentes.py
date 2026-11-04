"""
Persistencia del acceso a Google Drive (tabla tokens_drive).

El refresh_token se guarda cifrado con TOKEN_ENCRYPTION_KEY para que, tras reiniciar
el backend (memoria vacía), la subida a Drive lo use para pedir un access_token nuevo
sin que el docente vuelva a iniciar sesión. Cubre: reinicio, refresh_token revocado
(se borra la fila) o con fallo temporal (se conserva), clave cambiada o valor dañado
(sin sesión, sin 500), que no se guarde en claro, login sin refresh_token y el
callback completo. Ni Google ni Drive se llaman de verdad.
"""
from unittest.mock import AsyncMock, patch

import pytest
from cryptography.fernet import Fernet
from fastapi import FastAPI
from fastapi.testclient import TestClient
from google.auth.exceptions import RefreshError
from google.oauth2.credentials import Credentials
from sqlalchemy.exc import OperationalError

from app.config import settings
from app.database import get_db
from app.models import TokenDrive
from app.repositories.token_drive import TokenDriveRepository
from app.routers import auth
from app.services import google_auth, google_drive
from tests.test_catalogo_ra_abet import db_session  # noqa: F401 (fixture)
from tests.test_exportar_estudiantes import _alembic_sql
from tests.test_google_drive_refresh import REVOCADO, drive, refresh  # noqa: F401 (fixtures)

EMAIL = "docente@uao.edu.co"
REFRESH = "1//refresh-token-de-prueba"


@pytest.fixture(autouse=True)
def login_real(monkeypatch):
    monkeypatch.setattr(settings, "skip_auth", False)
    monkeypatch.setattr(settings, "token_encryption_key", Fernet.generate_key().decode())
    monkeypatch.setattr(google_auth, "_google_tokens", {})
    monkeypatch.setattr(google_drive, "_carpeta_cache", {EMAIL: "carpeta"})


def _login(db, **tokens) -> None:
    google_auth.guardar_tokens_drive(db, EMAIL, {"access_token": "token-login", "expires_in": 3599, **tokens})


def _reiniciar() -> None:
    """Lo que pasa al reiniciar el backend: la memoria queda vacía, la base no."""
    google_auth._google_tokens.clear()
    google_drive._carpeta_cache.clear()
    google_drive._carpeta_cache[EMAIL] = "carpeta"


def _fila(db):
    return TokenDriveRepository(db).de(EMAIL)


def _subir(db):
    return google_drive.subir_archivo(db, EMAIL, "reporte.xlsx", b"x", "application/octet-stream")


class TestReinicio:
    def test_usa_el_refresh_token_guardado_y_renueva(self, db_session, drive, refresh):
        _login(db_session, refresh_token=REFRESH)
        _reiniciar()
        assert _subir(db_session) == {"estado": "sincronizado", "detalle": None, "enlace": "https://drive/abc"}
        assert refresh.llamadas == 1
        assert drive.tokens and set(drive.tokens) == {"token-nuevo"}
        tokens = google_auth.obtener_tokens_drive(db_session, EMAIL)
        assert (tokens["access_token"], tokens["refresh_token"]) == ("token-nuevo", REFRESH)

    def test_la_segunda_subida_no_vuelve_a_renovar(self, db_session, drive, refresh):
        _login(db_session, refresh_token=REFRESH)
        _reiniciar()
        _subir(db_session)
        _subir(db_session)
        assert refresh.llamadas == 1

    def test_sin_fila_no_hay_sesion(self, db_session, drive, refresh):
        resultado = _subir(db_session)
        assert resultado["estado"] == "error"
        assert "iniciar sesión" in resultado["detalle"]
        assert refresh.llamadas == 0


class TestCredencialesSinAccessToken:
    """Tras un reinicio hay refresh_token pero no access_token ni expiry."""

    def test_en_google_auth_expired_es_falso_sin_expiry(self):
        # Por eso no basta con `credentials.expired` para decidir si renovar
        cred = Credentials(token=None, refresh_token="r", token_uri="https://t", client_id="c", client_secret="s")
        assert cred.expired is False
        assert cred.valid is False

    def test_credenciales_drive_renueva_si_no_hay_token(self, refresh):
        tokens = {"access_token": None, "refresh_token": REFRESH, "expires_at": None}
        google_auth._google_tokens[EMAIL] = tokens
        cred = google_drive._credenciales_drive(EMAIL, tokens)
        assert refresh.llamadas == 1
        assert cred.token == "token-nuevo"
        assert tokens["access_token"] == "token-nuevo"


class TestRefreshTokenRechazado:
    def test_revocado_borra_la_fila_y_pide_reautenticar(self, db_session, drive, refresh, caplog):
        _login(db_session, refresh_token=REFRESH)
        _reiniciar()
        refresh.error = REVOCADO
        resultado = _subir(db_session)
        assert resultado == {"estado": "error", "detalle": google_drive.MENSAJE_REAUTENTICAR, "enlace": None}
        assert _fila(db_session) is None
        assert google_auth.obtener_tokens_drive(db_session, EMAIL) is None
        assert REFRESH not in caplog.text

    def test_fallo_temporal_conserva_la_fila(self, db_session, drive, refresh):
        _login(db_session, refresh_token=REFRESH)
        _reiniciar()
        refresh.error = RefreshError("server_error", retryable=True)
        assert _subir(db_session)["detalle"] == google_drive.MENSAJE_REFRESH_TEMPORAL
        assert _fila(db_session) is not None
        _reiniciar()
        assert google_auth.obtener_tokens_drive(db_session, EMAIL)["refresh_token"] == REFRESH


class TestNoSePuedeDescifrar:
    def test_clave_cambiada_es_sin_sesion_y_no_borra(self, db_session, drive, refresh, monkeypatch, caplog):
        _login(db_session, refresh_token=REFRESH)
        _reiniciar()
        nueva = Fernet.generate_key().decode()
        monkeypatch.setattr(settings, "token_encryption_key", nueva)
        resultado = _subir(db_session)
        assert resultado["estado"] == "error"
        assert "iniciar sesión" in resultado["detalle"]
        assert refresh.llamadas == 0
        assert _fila(db_session) is not None  # si la clave se corrige, vuelve a servir
        assert "TOKEN_ENCRYPTION_KEY" in caplog.text
        assert REFRESH not in caplog.text and nueva not in caplog.text

    def test_valor_danado_es_sin_sesion(self, db_session, drive, refresh):
        TokenDriveRepository(db_session).guardar(EMAIL, "no-es-un-token-fernet")
        db_session.commit()
        assert _subir(db_session)["estado"] == "error"

    def test_el_siguiente_login_lo_reemplaza(self, db_session, monkeypatch):
        _login(db_session, refresh_token=REFRESH)
        monkeypatch.setattr(settings, "token_encryption_key", Fernet.generate_key().decode())
        _login(db_session, refresh_token="refresh-nuevo")
        _reiniciar()
        assert google_auth.obtener_tokens_drive(db_session, EMAIL)["refresh_token"] == "refresh-nuevo"


class TestGuardar:
    def test_no_se_guarda_en_claro(self, db_session):
        _login(db_session, refresh_token=REFRESH)
        cifrado = _fila(db_session).refresh_token_cifrado
        assert REFRESH not in cifrado
        assert Fernet(settings.token_encryption_key).decrypt(cifrado.encode()).decode() == REFRESH

    def test_el_access_token_no_va_a_la_base(self, db_session):
        _login(db_session, refresh_token=REFRESH)
        assert "token-login" not in _fila(db_session).refresh_token_cifrado
        _reiniciar()
        assert google_auth.obtener_tokens_drive(db_session, EMAIL)["access_token"] is None

    def test_un_login_nuevo_reemplaza_la_fila(self, db_session):
        _login(db_session, refresh_token=REFRESH)
        _login(db_session, refresh_token="refresh-2")
        _reiniciar()
        assert google_auth.obtener_tokens_drive(db_session, EMAIL)["refresh_token"] == "refresh-2"
        assert db_session.query(TokenDrive).count() == 1

    def test_login_sin_refresh_token_conserva_el_guardado(self, db_session):
        _login(db_session, refresh_token=REFRESH)
        _login(db_session)  # Google no siempre devuelve refresh_token
        assert google_auth.obtener_tokens_drive(db_session, EMAIL)["refresh_token"] == REFRESH
        _reiniciar()
        _login(db_session)  # ahora la memoria estaba vacía: lo toma de la base
        tokens = google_auth.obtener_tokens_drive(db_session, EMAIL)
        assert (tokens["access_token"], tokens["refresh_token"]) == ("token-login", REFRESH)
        _reiniciar()
        assert google_auth.obtener_tokens_drive(db_session, EMAIL)["refresh_token"] == REFRESH

    def test_fallo_de_la_base_no_impide_el_login(self, db_session, monkeypatch, caplog):
        def _falla(*_):
            raise OperationalError("INSERT ...", {"cifrado": "x"}, Exception("sin conexión"))

        monkeypatch.setattr(TokenDriveRepository, "guardar", _falla)
        _login(db_session, refresh_token=REFRESH)
        assert google_auth.obtener_tokens_drive(db_session, EMAIL)["refresh_token"] == REFRESH
        assert "OperationalError" in caplog.text
        assert "INSERT" not in caplog.text and REFRESH not in caplog.text


class TestMigracion0011:
    def test_upgrade_crea_la_tabla_con_email_unico(self):
        sql = _alembic_sql("upgrade", "0010:0011")
        assert "CREATE TABLE tokens_drive" in sql
        assert "refresh_token_cifrado TEXT NOT NULL" in sql
        assert "CONSTRAINT uq_tokens_drive_docente_email UNIQUE (docente_email)" in sql
        assert "version_num='0011'" in sql

    def test_downgrade_la_borra(self):
        sql = _alembic_sql("downgrade", "0011:0010")
        assert "DROP TABLE tokens_drive;" in sql
        assert "version_num='0010'" in sql


class TestCallback:
    def test_el_login_guarda_el_refresh_token_cifrado(self, db_session):
        app = FastAPI()
        app.include_router(auth.router)
        app.dependency_overrides[get_db] = lambda: db_session
        client = TestClient(app)
        client.cookies.set("oauth_state", "st")
        with patch("app.routers.auth.exchange_code_for_tokens", new_callable=AsyncMock) as ex, \
             patch("app.routers.auth.verify_id_token", return_value={"email": EMAIL, "nombre": "Doc"}):
            ex.return_value = {"id_token": "x", "access_token": "a", "refresh_token": REFRESH, "expires_in": 3599}
            resp = client.get("/auth/callback", params={"code": "c", "state": "st"}, follow_redirects=False)
        assert resp.status_code in (302, 307)
        assert REFRESH not in _fila(db_session).refresh_token_cifrado
        _reiniciar()
        assert google_auth.obtener_tokens_drive(db_session, EMAIL)["refresh_token"] == REFRESH
