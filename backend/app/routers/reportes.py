import base64
from typing import Optional
from urllib.parse import quote
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.schemas.reporte import (
    DetalleXlsxRequest, DetalleXlsxResponse, EstadoDrive, ReporteABETResponse, ReporteActividadResponse,
)
from app.services.reporte_excel import MIME_XLSX
from app.services.reportes import ReporteService

# Los errores de negocio (403, 404) los lanza ReporteService y los traduce a HTTP
# el manejador global registrado en main.py (app/errores_http.py)
router = APIRouter(prefix="/reportes", tags=["Reportes ABET"])


def _content_disposition(nombre: str) -> str:
    ascii_ = nombre.encode("ascii", "ignore").decode() or "reporte.xlsx"
    return f"attachment; filename=\"{ascii_}\"; filename*=UTF-8''{quote(nombre)}"


@router.get(
    "/abet/{curso_id}",
    response_model=ReporteABETResponse,
    summary="Reporte ABET por curso",
)
def reporte_abet(
    curso_id: int,
    seccion_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Reporte ABET del curso en dos niveles, contando por estudiante:

    - Por Criterio ABET (ej. 2.1.1): solo los códigos vinculados a algún aspecto
      de alguna actividad del curso. La nota de cada estudiante es el promedio
      simple de sus bloques (una actividad = un bloque por código), cada uno en
      escala 0-5.
    - Por Resultado de Aprendizaje (ej. 2.1): promedio de las notas de sus
      Criterios ponderado por su peso en el catálogo, renormalizado sobre los
      Criterios que el estudiante tiene evaluados.

    En actividades grupales cada integrante del equipo recibe la nota del equipo.
    La clasificación usa curso.rangos_calificacion.

    Parámetro opcional:
    - seccion_id: filtrar por sección (no se valida: solo filtra)

    404 si el curso no existe, 403 si es de otro docente.
    """
    return ReporteService(db).reporte_curso(curso_id, usuario["email"], seccion_id)


@router.get(
    "/abet/{curso_id}/actividad/{actividad_id}",
    response_model=ReporteActividadResponse,
    summary="Reporte ABET de una actividad",
)
def reporte_abet_actividad(
    curso_id: int,
    actividad_id: int,
    seccion_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Mismos dos niveles que el reporte del curso, acotados a los aspectos vinculados
    de una sola actividad. En el nivel RA, `criterios_sin_evidencia` son los
    Criterios que no se vincularon en esta actividad.
    404 si el curso no existe o la actividad o la sección no son de él, 403 si es de otro docente.
    """
    return ReporteService(db).reporte_actividad(curso_id, actividad_id, usuario["email"], seccion_id)


@router.get(
    "/abet/{curso_id}/actividad/{actividad_id}/resumen-xlsx",
    summary="Resumen en Excel (hoja Conteo) de una actividad",
    response_class=Response,
)
def resumen_xlsx(
    curso_id: int,
    actividad_id: int,
    seccion_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Libro con la hoja "Conteo": una fila por Criterio ABET y una torta por fila. No toca Drive.
    Mismos errores que el reporte de la actividad.
    """
    contenido, nombre = ReporteService(db).resumen_xlsx(curso_id, actividad_id, usuario["email"], seccion_id)
    return Response(
        content=contenido,
        media_type=MIME_XLSX,
        headers={"Content-Disposition": _content_disposition(nombre)},
    )


@router.post(
    "/abet/{curso_id}/actividad/{actividad_id}/detalle-xlsx",
    response_model=DetalleXlsxResponse,
    summary="Detalle en Excel de una actividad, sincronizado con Google Drive",
)
def detalle_xlsx(
    curso_id: int,
    actividad_id: int,
    body: DetalleXlsxRequest,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Genera la hoja "Conteo" más una hoja por equipo o estudiante calificado y la
    sube a la carpeta de Drive del docente. El archivo se devuelve siempre (en
    base64); `drive.estado` indica si la sincronización fue real, simulada
    (SKIP_AUTH) o falló.
    Mismos errores que el reporte de la actividad (sin llamar a Drive).
    """
    contenido, nombre, drive = ReporteService(db).detalle_xlsx(
        curso_id, actividad_id, usuario["email"], body.seccion_id,
    )
    return DetalleXlsxResponse(
        nombre_archivo=nombre,
        archivo_base64=base64.b64encode(contenido).decode(),
        drive=EstadoDrive(**drive),
    )
