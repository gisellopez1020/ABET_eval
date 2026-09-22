"""Pruebas de protección CSRF (state) en el flujo OAuth de Google."""
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.auth import router

app = FastAPI()
app.include_router(router)
client = TestClient(app)


class TestCallbackCSRF:
    def test_state_ausente_devuelve_401(self):
        with patch("app.routers.auth.exchange_code_for_tokens", new_callable=AsyncMock) as mock_exchange:
            resp = client.get("/auth/callback", params={"code": "abc"}, follow_redirects=False)
            assert resp.status_code == 401
            assert "CSRF" in resp.json()["detail"]
            mock_exchange.assert_not_called()

    def test_state_no_coincide_devuelve_401(self):
        client.cookies.set("oauth_state", "valor-cookie")
        with patch("app.routers.auth.exchange_code_for_tokens", new_callable=AsyncMock) as mock_exchange:
            resp = client.get(
                "/auth/callback",
                params={"code": "abc", "state": "valor-distinto"},
                follow_redirects=False,
            )
            assert resp.status_code == 401
            assert "CSRF" in resp.json()["detail"]
            mock_exchange.assert_not_called()
        client.cookies.clear()

    def test_state_valido_continua_el_flujo(self):
        client.cookies.set("oauth_state", "valor-correcto")
        with patch("app.routers.auth.exchange_code_for_tokens", new_callable=AsyncMock) as mock_exchange, \
             patch("app.routers.auth.verify_id_token") as mock_verify, \
             patch("app.routers.auth.guardar_tokens_drive"), \
             patch("app.routers.auth.create_access_token", return_value="jwt-app"):
            mock_exchange.return_value = {"id_token": "id-token-falso"}
            mock_verify.return_value = {"email": "doc@uao.edu.co", "nombre": "Doc"}

            resp = client.get(
                "/auth/callback",
                params={"code": "abc", "state": "valor-correcto"},
                follow_redirects=False,
            )

            mock_exchange.assert_called_once()
            assert resp.status_code in (302, 307)
            assert "jwt-app" in resp.headers["location"]
        client.cookies.clear()
