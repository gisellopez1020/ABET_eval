"""
Los endpoints `async def` que reciben un archivo (o el callback de Google) mandan su
trabajo síncrono (parseo, SQLAlchemy, cifrado, red hacia Google) a un hilo con
run_in_threadpool. Si lo hicieran en el event loop, mientras dura ninguna otra petición
avanzaría: con un solo worker, el servidor entero quedaría parado.

Cada prueba sustituye ese trabajo por un time.sleep y, mientras duerme, pide /health:
debe responder antes de que el trabajo termine. Con la llamada directa (sin el hilo) la
petición a /health solo empieza cuando el sueño ya acabó y la prueba falla.
"""
import asyncio
import threading
import time
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.schemas.criterio import RubricaExcelPreview
from app.schemas.estudiante import VistaPreviaEstudiantes
from app.services.criterios import CriterioService
from app.services.estudiantes import EstudianteService, ResultadoImportacion
from main import app

MOCK_USER = {"email": "profesor.test@uao.edu.co", "nombre": "Profesor Test"}
# Lo que dura el trabajo síncrono simulado; /health tarda milisegundos
DURACION = 1.0
# Los marca el trabajo simulado (en el hilo, o en el loop si se llamara directo)
empezo = threading.Event()
termino = threading.Event()
CSV = ("lista.csv", b"Nombre,Codigo\nAna Ruiz,1\n", "text/csv")

# (id, qué se sustituye, lo que devuelve, petición, código esperado)
CASOS = [
    pytest.param(
        (EstudianteService, "importar"), ResultadoImportacion(importados=1, avisos=[], omitidos=0),
        ("POST", "/secciones/1/estudiantes/csv", {"files": {"archivo": CSV}}), 201,
        id="importar_csv",
    ),
    pytest.param(
        (EstudianteService, "vista_previa"), VistaPreviaEstudiantes(estudiantes=[]),
        ("POST", "/secciones/1/estudiantes/vista-previa", {"files": {"archivo": CSV}}), 200,
        id="vista_previa_estudiantes",
    ),
    pytest.param(
        (CriterioService, "leer_excel"), RubricaExcelPreview(aspectos=[], total_peso=Decimal("0")),
        ("POST", "/actividades/1/criterios/importar-excel", {"files": {"archivo": ("r.xlsx", b"x", "application/octet-stream")}}),
        200,
        id="importar_excel_criterios",
    ),
    pytest.param(
        ("app.routers.auth", "verify_id_token"), {"email": MOCK_USER["email"], "nombre": "Doc"},
        ("GET", "/auth/callback", {"params": {"code": "c", "state": "st"}, "cookies": {"oauth_state": "st"}}), 307,
        id="callback",
    ),
]


@pytest.fixture
def overrides():
    # El trabajo real se sustituye: la sesión no se usa, basta un objeto cualquiera
    app.dependency_overrides[get_db] = lambda: object()
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER
    yield
    app.dependency_overrides.clear()


async def _health_mientras_trabaja(peticion):
    """Lanza la petición lenta y, en cuanto su trabajo síncrono empieza, GET /health.

    Devuelve la respuesta lenta, la de /health y si /health respondió con el trabajo aún
    en curso.
    """
    metodo, ruta, kwargs = peticion
    kwargs = dict(kwargs)  # el parámetro de pytest se comparte entre ejecuciones
    cookies = kwargs.pop("cookies", None)
    transporte = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transporte, base_url="http://test", cookies=cookies) as cliente:

        async def health_cuando_empiece():
            # Sondea sin bloquear el loop; si el loop está bloqueado, no corre hasta el final
            for _ in range(int(DURACION * 1000)):
                if empezo.is_set():
                    break
                await asyncio.sleep(0.01)
            resp = await cliente.get("/health")
            return resp, not termino.is_set()

        lenta, (salud, a_tiempo) = await asyncio.wait_for(
            asyncio.gather(cliente.request(metodo, ruta, **kwargs), health_cuando_empiece()),
            timeout=DURACION * 10,
        )
    return lenta, salud, a_tiempo


@pytest.mark.parametrize("objetivo, valor, peticion, codigo", CASOS)
def test_el_trabajo_sincrono_no_detiene_otras_peticiones(overrides, objetivo, valor, peticion, codigo):
    empezo.clear()
    termino.clear()

    def lento(*_args, **_kwargs):
        empezo.set()
        time.sleep(DURACION)
        termino.set()
        return valor

    destino, nombre = objetivo
    with patch.object(destino, nombre, lento) if not isinstance(destino, str) else patch(f"{destino}.{nombre}", lento), \
         patch("app.routers.auth.exchange_code_for_tokens", new_callable=AsyncMock, return_value={"id_token": "x"}), \
         patch("app.routers.auth.guardar_tokens_drive"):
        lenta, salud, a_tiempo = asyncio.run(_health_mientras_trabaja(peticion))

    assert lenta.status_code == codigo, lenta.text
    assert empezo.is_set() and termino.is_set()
    assert salud.status_code == 200
    assert a_tiempo, "GET /health esperó a que terminara el trabajo síncrono: el event loop quedó bloqueado"
