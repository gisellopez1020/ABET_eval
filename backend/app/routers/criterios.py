from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.archivos import leer_archivo_limitado
from app.database import get_db
from app.auth.dependencies import get_current_user
from app.schemas.criterio import (
    CriteriosPayload, CriteriosResponse, AspectoOut, VinculoAbetIn, RubricaExcelPreview,
)
from app.services.criterios import CriterioService

# Los errores de negocio (404, 403, 409, 422) los lanza CriterioService y los traduce
# a HTTP el manejador global registrado en main.py (app/errores_http.py)
router = APIRouter(tags=["Criterios"])


@router.get(
    "/actividades/{actividad_id}/criterios",
    response_model=CriteriosResponse,
    summary="Obtener criterios agrupados por aspecto",
)
def obtener_criterios(
    actividad_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Devuelve los criterios de la actividad agrupados por aspecto con el total de pesos.
    `tiene_calificaciones` indica que la rúbrica ya no se puede reemplazar (solo cambiar
    los vínculos ABET de sus aspectos).
    404 si la actividad no existe, 403 si es de otro docente.
    """
    return CriterioService(db).obtener(actividad_id, usuario["email"])


@router.put(
    "/actividades/{actividad_id}/criterios",
    response_model=CriteriosResponse,
    summary="Reemplazar criterios completos de la actividad",
)
def reemplazar_criterios(
    actividad_id: int,
    body: CriteriosPayload,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Reemplaza completamente los aspectos y criterios de la actividad.
    Valida que la suma de todos los pesos sea exactamente 100%.
    Retorna 422 si no suman 100%.
    Retorna 409 si la actividad ya tiene calificaciones (reemplazar los
    criterios las eliminaría en cascada).
    Cada aspecto puede traer codigo_abet (un Criterio del catálogo); el RA padre
    se agrega al ra_abet del curso si falta (422 si el código no existe, es un
    Resultado de Aprendizaje o la asignatura superaría su máximo de RA).
    404 si la actividad no existe, 403 si es de otro docente.
    """
    return CriterioService(db).reemplazar(actividad_id, usuario["email"], body.aspectos)


@router.post(
    "/actividades/{actividad_id}/criterios/importar-excel",
    response_model=RubricaExcelPreview,
    summary="Leer una rúbrica desde Excel (vista previa, no guarda)",
)
async def importar_excel_criterios(
    actividad_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Lee un .xlsx con columnas Aspecto | Criterio | %Criterio (aspecto en celdas
    fusionadas o repetido) y devuelve la rúbrica sin guardarla: el docente la revisa
    y la confirma con PUT /criterios, igual que el import por CSV.
    Retorna 409 si la actividad ya tiene calificaciones y 422 si el archivo no tiene
    el formato esperado o los pesos no suman 100%. Los aspectos llegan sin codigo_abet.
    404 si la actividad no existe, 403 si es de otro docente.
    """
    return CriterioService(db).leer_excel(actividad_id, usuario["email"], await leer_archivo_limitado(archivo))


@router.patch(
    "/actividades/{actividad_id}/aspectos/{aspecto_id}/codigo-abet",
    response_model=AspectoOut,
    summary="Vincular (o desvincular) un aspecto con un Criterio ABET",
)
def vincular_codigo_abet(
    actividad_id: int,
    aspecto_id: int,
    body: VinculoAbetIn,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Cambia solo el vínculo ABET del aspecto, sin reconstruir la rúbrica: se permite
    aunque la actividad ya tenga calificaciones. `codigo_abet: null` lo desvincula.
    El RA padre se agrega al ra_abet del curso si falta.
    404 si la actividad o el aspecto no existen, 403 si es de otro docente, 422 si el
    código no es válido o la asignatura superaría su máximo de RA.
    """
    aspecto = CriterioService(db).vincular_codigo_abet(actividad_id, aspecto_id, usuario["email"], body.codigo_abet)
    return AspectoOut.model_validate(aspecto)
