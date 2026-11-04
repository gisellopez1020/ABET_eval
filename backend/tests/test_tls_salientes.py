"""
RNF-13 hacia Google: el backend habla con Google OAuth, Drive y Gemini solo por
https y sin desactivar la verificación del certificado.

Vigila el código de app/ (no las dependencias): ninguna URL http:// que no sea local
y ningún verify=False, contexto SSL sin verificar ni similares. Si alguien agrega uno,
esta prueba falla y obliga a justificarlo.
"""
import ast
import re
from pathlib import Path

import pytest

from app.services import gemini, google_auth
from app.utils.urls import es_localhost

APP = Path(__file__).resolve().parents[1] / "app"
ARCHIVOS = sorted(APP.rglob("*.py"))

# Formas conocidas de apagar la verificación TLS en httpx, requests, ssl, urllib3 y httplib2
DESACTIVAR_TLS = [
    re.compile(r"\bverify\s*=\s*False\b"),
    re.compile(r"_create_unverified_context"),
    re.compile(r"\bCERT_NONE\b"),
    re.compile(r"check_hostname\s*=\s*False"),
    re.compile(r"disable_ssl_certificate_validation\s*=\s*True"),
    re.compile(r"cert_reqs\s*=\s*['\"]?(CERT_NONE|none)"),
    re.compile(r"PYTHONHTTPSVERIFY"),
    re.compile(r"InsecureRequestWarning"),
]


def _cadenas(ruta: Path):
    """Literales de texto del archivo; los comentarios y los docstrings no cuentan."""
    arbol = ast.parse(ruta.read_text(encoding="utf-8"))
    docstrings = {
        id(nodo.body[0].value)
        for nodo in ast.walk(arbol)
        if isinstance(nodo, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
        and nodo.body and isinstance(nodo.body[0], ast.Expr)
        and isinstance(nodo.body[0].value, ast.Constant)
    }
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Constant) and isinstance(nodo.value, str) and id(nodo) not in docstrings:
            yield nodo.lineno, nodo.value


def test_hay_archivos_que_revisar():
    assert len(ARCHIVOS) > 20


def test_ninguna_url_http_salvo_localhost():
    encontradas = [
        f"{ruta.relative_to(APP.parent)}:{linea}: {url}"
        for ruta in ARCHIVOS
        for linea, texto in _cadenas(ruta)
        for url in re.findall(r"http://[^\s'\"<>)]+", texto)
        if not es_localhost(url)
    ]
    assert encontradas == []


@pytest.mark.parametrize("ruta", ARCHIVOS, ids=lambda r: str(r.relative_to(APP.parent)))
def test_no_se_desactiva_la_verificacion_tls(ruta):
    codigo = ruta.read_text(encoding="utf-8")
    hallazgos = [patron.pattern for patron in DESACTIVAR_TLS if patron.search(codigo)]
    assert hallazgos == []


def test_endpoints_de_google_son_https():
    for url in (
        google_auth.AUTH_ENDPOINT,
        google_auth.TOKEN_ENDPOINT,
        gemini.API_URL,
        *google_auth.SCOPES,
    ):
        if url.startswith(("http://", "https://")):
            assert url.startswith("https://"), url
    assert gemini.API_URL.startswith("https://generativelanguage.googleapis.com/")
