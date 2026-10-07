"""
Límite de tamaño de los archivos subidos (listas de estudiantes y rúbricas).

Una lista de estudiantes o una rúbrica real pesa unos pocos KB; sin límite, un
archivo enorme (o un .xlsx pequeño que se descomprime en algo enorme) agotaría la
memoria o el disco del backend, compartido por todos los docentes. Hay dos capas:

- leer_archivo_limitado: lee el archivo en bloques y responde 413 en cuanto pasa
  de TAMANO_MAXIMO_ARCHIVO, sin construirlo entero en memoria; si es un .xlsx (zip)
  también limita lo que ocuparía descomprimido.
- LimiteCuerpoSubidas: middleware que corta la petición antes de que Starlette
  guarde la subida en disco (FastAPI procesa el formulario antes que el endpoint).
"""
import io
import json
import re
import zipfile
from typing import Iterable

from fastapi import HTTPException, UploadFile, status
from starlette.types import ASGIApp, Message, Receive, Scope, Send

MB = 1024 * 1024

# ~100 veces el tamaño de una lista o rúbrica real (10-30 KB)
TAMANO_MAXIMO_ARCHIVO = 2 * MB
# Un .xlsx de datos se comprime ~10x: uno legítimo de 2 MB no pasa de ~20 MB
TAMANO_MAXIMO_DESCOMPRIMIDO = 20 * MB
# Margen para las cabeceras multipart (boundary, nombre del archivo) del cuerpo
MARGEN_MULTIPART = 64 * 1024
TAMANO_MAXIMO_CUERPO = TAMANO_MAXIMO_ARCHIVO + MARGEN_MULTIPART

TAMANO_BLOQUE = 64 * 1024

# Rutas que reciben archivos (lista de estudiantes y rúbrica). [^/]+ y no \d+ para
# que ningún valor del parámetro (p. ej. -1, que FastAPI acepta) esquive el límite.
RUTAS_CON_SUBIDA = (
    r"/secciones/[^/]+/estudiantes/csv",
    r"/secciones/[^/]+/estudiantes/vista-previa",
    r"/actividades/[^/]+/criterios/importar-excel",
)
_FIRMA_ZIP = b"PK\x03\x04"

MENSAJE_DEMASIADO_GRANDE = (
    f"El archivo supera el tamaño máximo permitido ({TAMANO_MAXIMO_ARCHIVO // MB} MB). "
    "Las listas de estudiantes y las rúbricas suelen pesar unos pocos KB; "
    "revisa que sea el archivo correcto."
)
MENSAJE_DESCOMPRIMIDO_GRANDE = (
    "El archivo Excel ocuparía más de "
    f"{TAMANO_MAXIMO_DESCOMPRIMIDO // MB} MB al abrirlo, demasiado para una lista de "
    "estudiantes o una rúbrica; revisa que sea el archivo correcto."
)


def _demasiado_grande(detalle: str = MENSAJE_DEMASIADO_GRANDE) -> HTTPException:
    return HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=detalle)


def _verificar_descomprimido(contenido: bytes) -> None:
    """
    Si el contenido es un zip (.xlsx), rechaza el que declare más de
    TAMANO_MAXIMO_DESCOMPRIMIDO. zipfile nunca entrega más bytes que el tamaño
    declarado de cada entrada, así que la suma es un tope real para openpyxl.
    Un zip ilegible se deja pasar: el servicio responde su 422 de siempre.
    """
    if not contenido.startswith(_FIRMA_ZIP):
        return
    try:
        with zipfile.ZipFile(io.BytesIO(contenido)) as libro:
            total = sum(entrada.file_size for entrada in libro.infolist())
    except zipfile.BadZipFile:
        return
    if total > TAMANO_MAXIMO_DESCOMPRIMIDO:
        raise _demasiado_grande(MENSAJE_DESCOMPRIMIDO_GRANDE)


async def leer_archivo_limitado(archivo: UploadFile) -> bytes:
    """Lee el archivo subido en bloques; 413 si pasa del límite (o si descomprimido sería enorme)."""
    bloques: list[bytes] = []
    leidos = 0
    while bloque := await archivo.read(TAMANO_BLOQUE):
        leidos += len(bloque)
        if leidos > TAMANO_MAXIMO_ARCHIVO:
            raise _demasiado_grande()
        bloques.append(bloque)
    contenido = b"".join(bloques)
    _verificar_descomprimido(contenido)
    return contenido


class LimiteCuerpoSubidas:
    """
    Middleware ASGI: en los POST cuyas rutas coinciden con `rutas`, responde 413 si
    el Content-Length declarado pasa de `maximo`, y si no hay Content-Length (subida
    chunked) corta en cuanto los bytes recibidos lo superan. Las demás rutas no se tocan.
    """

    def __init__(
        self, app: ASGIApp, rutas: Iterable[str] = RUTAS_CON_SUBIDA, maximo: int = TAMANO_MAXIMO_CUERPO,
    ) -> None:
        self.app = app
        self.rutas = [re.compile(r) for r in rutas]
        self.maximo = maximo

    def _aplica(self, scope: Scope) -> bool:
        return (
            scope["type"] == "http"
            and scope["method"] == "POST"
            and any(r.fullmatch(scope["path"]) for r in self.rutas)
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if not self._aplica(scope):
            await self.app(scope, receive, send)
            return

        declarado = dict(scope["headers"]).get(b"content-length")
        if declarado is not None and declarado.isdigit() and int(declarado) > self.maximo:
            await _responder_413(send)
            return

        recibidos = 0

        async def receive_limitado() -> Message:
            nonlocal recibidos
            mensaje = await receive()
            if mensaje["type"] == "http.request":
                recibidos += len(mensaje.get("body", b""))
                if recibidos > self.maximo:
                    # HTTPException: FastAPI la deja pasar al procesar el formulario
                    # y su manejador responde 413 (otra excepción sería un 400 genérico)
                    raise _demasiado_grande()
            return mensaje

        await self.app(scope, receive_limitado, send)


async def _responder_413(send: Send) -> None:
    cuerpo = json.dumps({"detail": MENSAJE_DEMASIADO_GRANDE}).encode()
    await send({
        "type": "http.response.start",
        "status": status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        "headers": [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(cuerpo)).encode()),
            (b"connection", b"close"),
        ],
    })
    await send({"type": "http.response.body", "body": cuerpo})
