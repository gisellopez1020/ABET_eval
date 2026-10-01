"""
Traducción de los errores de negocio (app/services/errores.py) a respuestas HTTP.
La respuesta tiene la misma forma que la de HTTPException: {"detail": mensaje}.

Starlette busca el manejador recorriendo la jerarquía de la excepción, así que
basta registrar las categorías: cualquier subclase usa el código de la suya.
"""
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.services.errores import Conflicto, ErrorDeNegocio, NoEncontrado, SinPermiso

CODIGOS: dict[type[ErrorDeNegocio], int] = {
    NoEncontrado: status.HTTP_404_NOT_FOUND,
    SinPermiso: status.HTTP_403_FORBIDDEN,
    Conflicto: status.HTTP_409_CONFLICT,
}


def registrar_manejadores(app: FastAPI) -> None:
    for categoria, codigo in CODIGOS.items():
        app.add_exception_handler(categoria, _manejador(codigo))


def _manejador(codigo: int):
    async def manejar(request: Request, exc: ErrorDeNegocio) -> JSONResponse:
        return JSONResponse(status_code=codigo, content={"detail": str(exc)})
    return manejar
