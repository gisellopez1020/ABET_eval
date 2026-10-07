"""
Límite de tamaño de los archivos subidos (app/archivos.py) en los tres endpoints que
los reciben: importar y previsualizar estudiantes, e importar la rúbrica desde Excel.

Los servicios se reemplazan por dobles que registran los bytes recibidos: lo que se
prueba aquí es que el archivo llega íntegro (o no llega), no el parseo, que ya cubren
test_estudiantes / test_criterios / test_import_excel con archivos reales.
"""
import io
import zipfile
from types import SimpleNamespace

import pytest
from fastapi import UploadFile

from app.archivos import (
    MENSAJE_DEMASIADO_GRANDE,
    MENSAJE_DESCOMPRIMIDO_GRANDE,
    TAMANO_BLOQUE,
    TAMANO_MAXIMO_ARCHIVO,
    TAMANO_MAXIMO_CUERPO,
    TAMANO_MAXIMO_DESCOMPRIMIDO,
    leer_archivo_limitado,
)
from app.services.criterios import CriterioService
from app.services.estudiantes import EstudianteService
from tests.test_catalogo_ra_abet import client, db_session  # noqa: F401 (fixtures)

LIMITE = TAMANO_MAXIMO_ARCHIVO

ENDPOINTS = {
    "importar-estudiantes": ("/secciones/1/estudiantes/csv", "lista.csv", 201),
    "vista-previa-estudiantes": ("/secciones/1/estudiantes/vista-previa", "lista.csv", 200),
    "importar-rubrica": ("/actividades/1/criterios/importar-excel", "rubrica.xlsx", 200),
}


@pytest.fixture
def recibido(monkeypatch):
    """Reemplaza los tres servicios por dobles que guardan los bytes que les llegan."""
    llamadas: list[bytes] = []

    def importar(self, seccion_id, email, contenido, nombre, content_type):
        llamadas.append(contenido)
        return SimpleNamespace(importados=0, avisos=[])

    def vista_previa(self, seccion_id, email, contenido, nombre, content_type):
        llamadas.append(contenido)
        return {"estudiantes": [], "errores": []}

    def leer_excel(self, actividad_id, email, contenido):
        llamadas.append(contenido)
        return {"aspectos": [], "total_peso": 0}

    monkeypatch.setattr(EstudianteService, "importar", importar)
    monkeypatch.setattr(EstudianteService, "vista_previa", vista_previa)
    monkeypatch.setattr(CriterioService, "leer_excel", leer_excel)
    return llamadas


def _subir(client, endpoint: str, contenido: bytes):
    url, nombre, _ = ENDPOINTS[endpoint]
    return client.post(url, files={"archivo": (nombre, contenido, "application/octet-stream")})


def _xlsx_que_se_descomprime_en(tamano: int) -> bytes:
    """Zip pequeño (ceros comprimidos) que declara `tamano` bytes descomprimido."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as libro:
        libro.writestr("xl/worksheets/sheet1.xml", b"\0" * tamano)
    return buffer.getvalue()


@pytest.mark.parametrize("endpoint", ENDPOINTS)
class TestLimiteEnLosTresEndpoints:
    @pytest.mark.parametrize("tamano", [LIMITE - 1, LIMITE], ids=["justo-debajo", "en-el-limite"])
    def test_hasta_el_limite_llega_integro_al_servicio(self, client, recibido, endpoint, tamano):
        contenido = bytes(range(256)) * (tamano // 256) + b"x" * (tamano % 256)
        resp = _subir(client, endpoint, contenido)
        assert resp.status_code == ENDPOINTS[endpoint][2], resp.text
        assert recibido == [contenido]

    def test_por_encima_del_limite_413_sin_llegar_al_servicio(self, client, recibido, endpoint):
        resp = _subir(client, endpoint, b"x" * (LIMITE + 1))
        assert resp.status_code == 413
        assert resp.json()["detail"] == MENSAJE_DEMASIADO_GRANDE
        assert recibido == []

    def test_xlsx_que_se_descomprime_en_algo_enorme_413(self, client, recibido, endpoint):
        bomba = _xlsx_que_se_descomprime_en(TAMANO_MAXIMO_DESCOMPRIMIDO + 1)
        assert len(bomba) < 100 * 1024  # pequeño comprimido: el límite de tamaño no lo frenaría
        resp = _subir(client, endpoint, bomba)
        assert resp.status_code == 413
        assert resp.json()["detail"] == MENSAJE_DESCOMPRIMIDO_GRANDE
        assert recibido == []

    def test_xlsx_que_se_descomprime_hasta_el_limite_pasa(self, client, recibido, endpoint):
        libro = _xlsx_que_se_descomprime_en(TAMANO_MAXIMO_DESCOMPRIMIDO)
        assert _subir(client, endpoint, libro).status_code == ENDPOINTS[endpoint][2]
        assert recibido == [libro]


class TestLecturaPorBloques:
    class _ArchivoInfinito:
        """UploadFile falso que entrega bloques sin fin y cuenta cuántos bytes se le pidieron."""

        def __init__(self):
            self.leidos = 0

        async def read(self, n: int = -1) -> bytes:
            assert n > 0, "debe leer por bloques, nunca el archivo completo"
            self.leidos += n
            return b"x" * n

    async def _leer(self, archivo):
        return await leer_archivo_limitado(archivo)

    def test_deja_de_leer_al_pasar_el_limite(self):
        import asyncio
        from fastapi import HTTPException

        archivo = self._ArchivoInfinito()
        with pytest.raises(HTTPException) as exc:
            asyncio.run(self._leer(archivo))
        assert exc.value.status_code == 413
        assert archivo.leidos <= LIMITE + TAMANO_BLOQUE

    def test_zip_ilegible_se_deja_al_servicio(self):
        import asyncio

        corrupto = b"PK\x03\x04" + b"no es un zip"
        archivo = UploadFile(io.BytesIO(corrupto))
        assert asyncio.run(self._leer(archivo)) == corrupto


def _multipart(tamano_archivo: int, bloque: int = TAMANO_BLOQUE):
    """Cuerpo multipart generado por partes: httpx lo envía chunked, sin Content-Length."""
    limite = "limite-de-prueba"
    yield (
        f"--{limite}\r\nContent-Disposition: form-data; name=\"archivo\"; filename=\"lista.csv\"\r\n"
        "Content-Type: text/csv\r\n\r\n"
    ).encode()
    enviados = 0
    while enviados < tamano_archivo:
        parte = min(bloque, tamano_archivo - enviados)
        enviados += parte
        yield b"x" * parte
    yield f"\r\n--{limite}--\r\n".encode()


CABECERA_MULTIPART = {"Content-Type": "multipart/form-data; boundary=limite-de-prueba"}


class TestMiddlewareAntesDelDisco:
    def test_content_length_excesivo_413_sin_procesar_el_formulario(self, client, recibido):
        resp = client.post(
            "/secciones/1/estudiantes/csv",
            content=b"x" * (TAMANO_MAXIMO_CUERPO + 1),
            headers=CABECERA_MULTIPART,
        )
        assert resp.status_code == 413
        assert resp.json()["detail"] == MENSAJE_DEMASIADO_GRANDE
        assert recibido == []

    def test_subida_chunked_sin_content_length_se_corta(self, client, recibido):
        resp = client.post(
            "/actividades/1/criterios/importar-excel",
            content=_multipart(TAMANO_MAXIMO_CUERPO + 1),
            headers=CABECERA_MULTIPART,
        )
        assert "content-length" not in resp.request.headers
        assert resp.status_code == 413
        assert resp.json()["detail"] == MENSAJE_DEMASIADO_GRANDE
        assert recibido == []

    def test_subida_chunked_dentro_del_limite_pasa(self, client, recibido):
        resp = client.post(
            "/secciones/1/estudiantes/vista-previa",
            content=_multipart(1000),
            headers=CABECERA_MULTIPART,
        )
        assert resp.status_code == 200, resp.text
        assert recibido == [b"x" * 1000]

    @pytest.mark.parametrize("seccion", ["-1", "abc"])
    def test_ningun_valor_del_parametro_esquiva_el_limite(self, client, recibido, seccion):
        resp = client.post(
            f"/secciones/{seccion}/estudiantes/csv",
            content=b"x" * (TAMANO_MAXIMO_CUERPO + 1),
            headers=CABECERA_MULTIPART,
        )
        assert resp.status_code == 413

    def test_las_demas_rutas_no_se_limitan(self, client):
        resp = client.post(
            "/cursos",
            content=b"x" * (TAMANO_MAXIMO_CUERPO + 1),
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code != 413


class TestMiddlewareAislado:
    """
    El middleware solo, con una app ASGI falsa: fija *cuándo* corta, no solo que el
    resultado final sea 413 (eso también lo daría la lectura por bloques, más tarde y
    con la subida ya en disco).
    """

    MAXIMO = 100
    BLOQUE = 10

    def _ejecutar(self, headers, total=1000):
        import asyncio
        from fastapi import HTTPException

        from app.archivos import LimiteCuerpoSubidas

        estado = {"app_llamada": False, "consumidos": 0, "enviado": [], "error": None}

        async def receive():
            parte = min(self.BLOQUE, total - estado["consumidos"])
            estado["consumidos"] += parte
            return {"type": "http.request", "body": b"x" * parte, "more_body": estado["consumidos"] < total}

        async def send(mensaje):
            estado["enviado"].append(mensaje)

        async def app(scope, receive, send):
            estado["app_llamada"] = True
            while (await receive()).get("more_body"):
                pass

        middleware = LimiteCuerpoSubidas(app, rutas=[r"/subir"], maximo=self.MAXIMO)
        scope = {"type": "http", "method": "POST", "path": "/subir", "headers": headers}
        try:
            asyncio.run(middleware(scope, receive, send))
        except HTTPException as exc:
            estado["error"] = exc.status_code
        return estado

    def test_content_length_excesivo_responde_413_sin_leer_el_cuerpo(self):
        estado = self._ejecutar([(b"content-length", str(self.MAXIMO + 1).encode())])
        assert estado["app_llamada"] is False
        assert estado["consumidos"] == 0
        assert estado["enviado"][0]["status"] == 413

    def test_sin_content_length_corta_sin_consumir_mas_del_maximo(self):
        estado = self._ejecutar([], total=10 * self.MAXIMO)
        assert estado["error"] == 413
        assert estado["consumidos"] <= self.MAXIMO + self.BLOQUE

    def test_dentro_del_maximo_no_interfiere(self):
        estado = self._ejecutar([(b"content-length", str(self.MAXIMO).encode())], total=self.MAXIMO)
        assert estado["app_llamada"] is True
        assert estado["error"] is None
        assert estado["enviado"] == []
