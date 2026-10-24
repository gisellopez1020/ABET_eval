"""
Cliente mínimo de la API de Gemini (generateContent) por HTTP con httpx.

`redactar` nunca lanza: ante cualquier falla (sin key, red, timeout, 4xx/5xx, cuota,
respuesta vacía o cortada) devuelve None y quien la llama usa la retroalimentación
estructurada. La key va en un header, no en la URL, para que no quede en logs de acceso.
"""
import logging
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger("abet.gemini")

API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent"


def redactar(
    instrucciones: str, mensaje: str, transport: Optional[httpx.BaseTransport] = None,
) -> Optional[str]:
    """Texto redactado por el modelo, o None si no está configurado o falló.

    `transport` solo lo usan las pruebas (httpx.MockTransport).
    """
    if not settings.gemini_habilitado:
        return None

    generation_config: dict = {"temperature": 0.3, "maxOutputTokens": 1024}
    if settings.gemini_thinking_level.strip():
        generation_config["thinkingConfig"] = {"thinkingLevel": settings.gemini_thinking_level.strip()}
    body = {
        "systemInstruction": {"parts": [{"text": instrucciones}]},
        "contents": [{"role": "user", "parts": [{"text": mensaje}]}],
        "generationConfig": generation_config,
    }
    timeout = httpx.Timeout(settings.gemini_timeout_segundos, connect=min(3.0, settings.gemini_timeout_segundos))
    try:
        with httpx.Client(timeout=timeout, transport=transport) as client:
            resp = client.post(
                API_URL.format(modelo=settings.gemini_model),
                headers={"x-goog-api-key": settings.gemini_api_key.strip()},
                json=body,
            )
        if resp.status_code != 200:
            logger.warning("Gemini respondió %s: %s", resp.status_code, resp.text[:300])
            return None
        candidato = (resp.json().get("candidates") or [{}])[0]
        if candidato.get("finishReason") != "STOP":
            logger.warning("Gemini terminó con finishReason=%s", candidato.get("finishReason"))
            return None
        partes = candidato.get("content", {}).get("parts") or []
        # Las partes marcadas como `thought` son el razonamiento del modelo, no la respuesta
        texto = "".join(p.get("text", "") for p in partes if not p.get("thought")).strip()
        return texto or None
    except httpx.TimeoutException:
        logger.warning("Gemini no respondió en %ss", settings.gemini_timeout_segundos)
        return None
    except Exception:  # red, JSON inválido, forma inesperada: nunca debe tumbar la petición
        logger.warning("Falló la llamada a Gemini", exc_info=True)
        return None
