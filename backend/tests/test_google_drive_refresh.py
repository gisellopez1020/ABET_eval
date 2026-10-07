"""
Renovación del access_token de Google Drive con el refresh_token.

Cubre sincronizar_calificacion y subir_archivo con login real (SKIP_AUTH=false):
token vencido que se renueva, refresh_token revocado (el docente debe volver a
iniciar sesión), fallo temporal de Google y token vigente (no se renueva).
Ni Google ni Drive se llaman de verdad: Credentials.refresh y el servicio de
Drive se reemplazan por dobles que registran el token usado.
"""
import asyncio
from datetime import timedelta
from types import SimpleNamespace

import pytest
from google.auth.exceptions import RefreshError
from google.oauth2.credentials import Credentials

from app.config import settings
from app.services import google_auth, google_drive

EMAIL = "docente@uao.edu.co"


@pytest.fixture(autouse=True)
def login_real(monkeypatch):
    monkeypatch.setattr(settings, "skip_auth", False)
    monkeypatch.setattr(google_auth, "_google_tokens", {})
    monkeypatch.setattr(google_drive, "_carpeta_cache", {EMAIL: "carpeta"})
    monkeypatch.setattr(google_drive, "_sync_status", {})


@pytest.fixture
def drive(monkeypatch):
    """Servicio de Drive falso: registra el token con el que se ejecuta cada llamada."""
    registro = SimpleNamespace(tokens=[], error=None)

    def _build(credentials):
        def _peticion(resultado):
            def _execute():
                if registro.error:
                    raise registro.error
                registro.tokens.append(credentials.token)
                return resultado
            return SimpleNamespace(execute=_execute)

        archivos = SimpleNamespace(
            list=lambda **_: _peticion({"files": []}),
            create=lambda **_: _peticion({"id": "abc", "webViewLink": "https://drive/abc"}),
            update=lambda **_: _peticion({"id": "abc", "webViewLink": "https://drive/abc"}),
        )
        return SimpleNamespace(files=lambda: archivos)

    monkeypatch.setattr(google_drive, "_build_drive_service", _build)
    return registro


@pytest.fixture
def refresh(monkeypatch):
    """Reemplaza Credentials.refresh; por defecto renueva con 'token-nuevo'."""
    registro = SimpleNamespace(llamadas=0, error=None)

    def _refresh(self, request):
        registro.llamadas += 1
        if registro.error:
            raise registro.error
        self.token = "token-nuevo"
        self.expiry = google_auth._utcnow() + timedelta(hours=1)

    monkeypatch.setattr(Credentials, "refresh", _refresh)
    return registro


def _login(expires_in: int) -> None:
    google_auth._google_tokens[EMAIL] = {
        "access_token": "token-viejo",
        "refresh_token": "refresh-1",
        "expires_at": google_auth._utcnow() + timedelta(seconds=expires_in),
    }


def _sincronizar():
    return asyncio.run(google_drive.sincronizar_calificacion(7, email=EMAIL))


def _subir():
    return google_drive.subir_archivo(EMAIL, "reporte.xlsx", b"x", "application/octet-stream")


REVOCADO = RefreshError("invalid_grant: Token has been expired or revoked.", retryable=False)


class TestGuardarTokens:
    def test_guarda_el_vencimiento_a_partir_de_expires_in(self):
        antes = google_auth._utcnow()
        google_auth.guardar_tokens_drive(
            EMAIL, {"access_token": "a", "refresh_token": "r", "expires_in": 3599}
        )
        expires_at = google_auth.obtener_tokens_drive(EMAIL)["expires_at"]
        assert antes + timedelta(seconds=3599) <= expires_at <= google_auth._utcnow() + timedelta(seconds=3599)

    def test_sin_expires_in_no_inventa_vencimiento(self):
        google_auth.guardar_tokens_drive(EMAIL, {"access_token": "a", "refresh_token": "r"})
        assert google_auth.obtener_tokens_drive(EMAIL)["expires_at"] is None


class TestTokenVencidoRefreshExitoso:
    def test_sincronizar_calificacion_continua(self, drive, refresh):
        _login(expires_in=-60)
        assert _sincronizar() == {"status": "sincronizado", "calificacion_id": 7}
        assert refresh.llamadas == 1
        assert drive.tokens and set(drive.tokens) == {"token-nuevo"}
        assert google_auth.obtener_tokens_drive(EMAIL)["access_token"] == "token-nuevo"
        assert google_auth.obtener_tokens_drive(EMAIL)["refresh_token"] == "refresh-1"

    def test_subir_archivo_continua(self, drive, refresh):
        _login(expires_in=-60)
        assert _subir() == {"estado": "sincronizado", "detalle": None, "enlace": "https://drive/abc"}
        assert set(drive.tokens) == {"token-nuevo"}
        assert google_auth.obtener_tokens_drive(EMAIL)["access_token"] == "token-nuevo"

    def test_token_a_punto_de_vencer_tambien_se_renueva(self, drive, refresh):
        _login(expires_in=60)  # dentro del margen de google-auth (3 min 45 s)
        assert _sincronizar()["status"] == "sincronizado"
        assert refresh.llamadas == 1


class TestRefreshTokenRevocado:
    def test_sincronizar_calificacion_pide_reautenticar(self, drive, refresh):
        _login(expires_in=-60)
        refresh.error = REVOCADO
        resultado = _sincronizar()
        assert resultado["status"] == "error"
        assert "Vuelve a iniciar sesión con Google" in resultado["detalle"]
        assert drive.tokens == []
        assert google_auth.obtener_tokens_drive(EMAIL) is None
        assert google_drive._sync_status[7] == "error"

    def test_subir_archivo_pide_reautenticar(self, drive, refresh):
        _login(expires_in=-60)
        refresh.error = REVOCADO
        resultado = _subir()
        assert resultado["estado"] == "error"
        assert "Vuelve a iniciar sesión con Google" in resultado["detalle"]
        assert google_auth.obtener_tokens_drive(EMAIL) is None

    # Camino del 401: google-auth renueva dentro de execute() y Google lo rechaza
    def test_revocado_durante_la_llamada_a_drive_sincronizar(self, drive, refresh):
        _login(expires_in=3600)
        drive.error = REVOCADO
        resultado = _sincronizar()
        assert resultado["status"] == "error"
        assert "Vuelve a iniciar sesión con Google" in resultado["detalle"]

    def test_revocado_durante_la_llamada_a_drive_subir_archivo(self, drive, refresh):
        _login(expires_in=3600)
        drive.error = REVOCADO
        assert "Vuelve a iniciar sesión con Google" in _subir()["detalle"]

    def test_fallo_temporal_no_pide_reautenticar_ni_borra_tokens(self, drive, refresh):
        _login(expires_in=-60)
        refresh.error = RefreshError("server_error", retryable=True)
        resultado = _sincronizar()
        assert resultado == {"status": "error", "detalle": google_drive.MENSAJE_REFRESH_TEMPORAL}
        assert google_auth.obtener_tokens_drive(EMAIL)["refresh_token"] == "refresh-1"


class TestTokenVigente:
    def test_sincronizar_no_renueva(self, drive, refresh):
        _login(expires_in=3600)
        assert _sincronizar()["status"] == "sincronizado"
        assert refresh.llamadas == 0
        assert set(drive.tokens) == {"token-viejo"}
        assert google_auth.obtener_tokens_drive(EMAIL)["access_token"] == "token-viejo"

    def test_subir_archivo_no_renueva(self, drive, refresh):
        _login(expires_in=3600)
        assert _subir()["estado"] == "sincronizado"
        assert refresh.llamadas == 0
        assert set(drive.tokens) == {"token-viejo"}

    def test_sin_vencimiento_conocido_no_renueva(self, drive, refresh):
        _login(expires_in=3600)
        google_auth._google_tokens[EMAIL]["expires_at"] = None
        assert _sincronizar()["status"] == "sincronizado"
        assert refresh.llamadas == 0


class TestCredenciales:
    def test_incluyen_lo_necesario_para_renovarse(self, monkeypatch):
        monkeypatch.setattr(settings, "google_client_id", "cid")
        monkeypatch.setattr(settings, "google_client_secret", "csecret")
        _login(expires_in=3600)
        cred = google_drive._credenciales_drive(EMAIL, google_auth.obtener_tokens_drive(EMAIL))
        assert cred.refresh_token == "refresh-1"
        assert cred.token_uri == google_auth.TOKEN_ENDPOINT
        assert (cred.client_id, cred.client_secret) == ("cid", "csecret")
        assert cred.valid


class TestRespaldoDel401:
    """Con la librería real: Drive responde 401 → google-auth renueva y reintenta."""

    def test_401_renueva_reintenta_y_guarda_el_token(self, monkeypatch, refresh):
        from google_auth_httplib2 import AuthorizedHttp
        from googleapiclient.discovery import build
        from googleapiclient.http import HttpMockSequence

        respuestas = HttpMockSequence([
            ({"status": "401"}, '{"error": {"code": 401, "message": "Invalid Credentials"}}'),
            ({"status": "200"}, '{"files": []}'),
            ({"status": "200"}, '{"id": "abc", "webViewLink": "https://drive/abc"}'),
        ])

        def _build_real(credentials):
            http = AuthorizedHttp(credentials, http=respuestas)
            return build("drive", "v3", http=http, cache_discovery=False, static_discovery=True)

        monkeypatch.setattr(google_drive, "_build_drive_service", _build_real)
        _login(expires_in=3600)  # vigente según expires_at, pero Google ya no lo acepta

        assert _subir() == {"estado": "sincronizado", "detalle": None, "enlace": "https://drive/abc"}
        assert refresh.llamadas == 1
        assert google_auth.obtener_tokens_drive(EMAIL)["access_token"] == "token-nuevo"
