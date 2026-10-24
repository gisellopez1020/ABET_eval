"""
Cliente de Gemini (services/gemini.py) con httpx.MockTransport: qué envía y que ante
cualquier falla devuelve None en vez de lanzar. Nunca sale a la red.
"""
import json

import httpx
import pytest

from app.config import settings
from app.services import gemini


@pytest.fixture()
def con_key(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "key-de-prueba")
    monkeypatch.setattr(settings, "gemini_model", "modelo-x")
    monkeypatch.setattr(settings, "gemini_thinking_level", "low")


def _respuesta(texto="Lograron todo.", finish="STOP", partes=None):
    partes = partes if partes is not None else [{"text": texto}]
    return {"candidates": [{"content": {"parts": partes}, "finishReason": finish}]}


def _transport(handler):
    return httpx.MockTransport(handler)


def test_sin_key_no_llama(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "PLACEHOLDER")

    def handler(request):  # pragma: no cover - no debe llamarse
        raise AssertionError("no debía llamar a la API")

    assert gemini.redactar("i", "m", transport=_transport(handler)) is None
    monkeypatch.setattr(settings, "gemini_api_key", "   ")
    assert gemini.redactar("i", "m", transport=_transport(handler)) is None


def test_envia_modelo_key_en_header_e_instrucciones(con_key):
    enviado = {}

    def handler(request):
        enviado["url"] = str(request.url)
        enviado["key"] = request.headers.get("x-goog-api-key")
        enviado["body"] = json.loads(request.content)
        enviado["timeout"] = request.extensions["timeout"]
        return httpx.Response(200, json=_respuesta("  Lograron todo.  "))

    assert gemini.redactar("las reglas", "los datos", transport=_transport(handler)) == "Lograron todo."
    assert enviado["url"].endswith("/models/modelo-x:generateContent")
    assert "key-de-prueba" not in enviado["url"]
    assert enviado["key"] == "key-de-prueba"
    body = enviado["body"]
    assert body["systemInstruction"]["parts"][0]["text"] == "las reglas"
    assert body["contents"][0]["parts"][0]["text"] == "los datos"
    assert body["generationConfig"]["thinkingConfig"] == {"thinkingLevel": "low"}
    assert enviado["timeout"]["read"] == settings.gemini_timeout_segundos
    assert enviado["timeout"]["connect"] <= 3.0


def test_sin_thinking_level_no_lo_envia(con_key, monkeypatch):
    monkeypatch.setattr(settings, "gemini_thinking_level", "")
    enviado = {}

    def handler(request):
        enviado["body"] = json.loads(request.content)
        return httpx.Response(200, json=_respuesta())

    gemini.redactar("i", "m", transport=_transport(handler))
    assert "thinkingConfig" not in enviado["body"]["generationConfig"]


def test_ignora_partes_de_razonamiento(con_key):
    partes = [{"text": "pensando...", "thought": True}, {"text": "Lograron "}, {"text": "todo."}]
    transport = _transport(lambda r: httpx.Response(200, json=_respuesta(partes=partes)))
    assert gemini.redactar("i", "m", transport=transport) == "Lograron todo."


@pytest.mark.parametrize("respuesta", [
    httpx.Response(503, json={"error": {"code": 503, "message": "high demand"}}),
    httpx.Response(429, json={"error": {"code": 429, "message": "quota"}}),
    httpx.Response(400, json={"error": {"code": 400, "message": "bad"}}),
    httpx.Response(200, json=_respuesta(finish="MAX_TOKENS")),
    httpx.Response(200, json=_respuesta(finish="SAFETY")),
    httpx.Response(200, json=_respuesta(texto="   ")),
    httpx.Response(200, json={"candidates": []}),
    httpx.Response(200, json={}),
    httpx.Response(200, text="no es json"),
], ids=["503", "429", "400", "max_tokens", "safety", "vacio", "sin_candidatos", "sin_nada", "no_json"])
def test_fallas_devuelven_none(con_key, respuesta):
    assert gemini.redactar("i", "m", transport=_transport(lambda r: respuesta)) is None


@pytest.mark.parametrize("error", [
    httpx.ReadTimeout("lento"), httpx.ConnectTimeout("lento"), httpx.ConnectError("sin red"),
], ids=["read_timeout", "connect_timeout", "sin_red"])
def test_timeout_y_red_devuelven_none(con_key, error):
    def handler(request):
        raise error

    assert gemini.redactar("i", "m", transport=_transport(handler)) is None
