from decimal import Decimal
from typing import Iterable, List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import Actividad, Aspecto, Criterio
from app.schemas.criterio import (
    CriteriosPayload, CriteriosResponse, AspectoOut, VinculoAbetIn, RubricaExcelPreview,
)
from app.schemas.curso import MAX_RA_ABET
from app.repositories.actividad import ActividadRepository
from app.repositories.calificacion import CalificacionRepository
from app.repositories.curso import CursoRepository
from app.repositories.ra_abet import RaAbetRepository
from app.repositories.rubrica import RubricaRepository
from app.utils.excel_parser import ExcelParserError, parsear_excel_criterios

router = APIRouter(tags=["Criterios"])


def _verificar_actividad(actividad_id: int, email: str, db: Session) -> Actividad:
    actividad = ActividadRepository(db).get(actividad_id)
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    curso = CursoRepository(db).get(actividad.curso_id)
    if not curso or curso.docente_email != email:
        raise HTTPException(status_code=403, detail="No tiene permiso sobre esta actividad")
    return actividad


def _validar_codigos_abet(codigos: Iterable[Optional[str]], db: Session) -> List[str]:
    """
    Cada codigo_abet debe existir en el catálogo y ser un Criterio (tener codigo_padre),
    no un Resultado de Aprendizaje. Devuelve los códigos de los RA padre (sin repetir).
    """
    codigos = [c for c in dict.fromkeys(codigos) if c]
    if not codigos:
        return []
    padres = RaAbetRepository(db).padres_de(codigos)
    for codigo in codigos:
        if codigo not in padres:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"El código ABET '{codigo}' no existe en el catálogo de Student Outcomes",
            )
        if padres[codigo] is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"'{codigo}' es un Resultado de Aprendizaje, no un Criterio — "
                       f"usa un código como {codigo}.1",
            )
    return list(dict.fromkeys(padres[c] for c in codigos))


def _agregar_ra_al_curso(actividad: Actividad, codigos_ra: List[str], db: Session) -> None:
    """
    Agrega al ra_abet del curso los RA padre que falten (no se exige configurarlos antes).
    Conserva lo que ya haya, incluidos valores antiguos, y respeta el máximo de RA por curso.
    """
    curso = CursoRepository(db).get(actividad.curso_id)
    actual = list(curso.ra_abet or [])
    faltantes = [c for c in codigos_ra if c not in actual]
    if not faltantes:
        return
    if len(actual) + len(faltantes) > MAX_RA_ABET:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Vincular este código agregaría {', '.join(faltantes)} a la asignatura "
                   f"'{curso.nombre}', que ya tiene {len(actual)} de {MAX_RA_ABET} RA ABET. "
                   "Quita alguno en Editar asignatura.",
        )
    # Asignar una lista nueva: SQLAlchemy no detecta mutaciones en sitio de una columna JSON
    curso.ra_abet = actual + faltantes


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
    """
    actividad = _verificar_actividad(actividad_id, usuario["email"], db)
    aspectos_out = [AspectoOut.model_validate(a) for a in actividad.aspectos]
    total = sum(
        c.peso_porcentaje
        for a in actividad.aspectos
        for c in a.criterios
    )
    return CriteriosResponse(
        aspectos=aspectos_out,
        total_peso=total,
        tiene_calificaciones=CalificacionRepository(db).existen_para_actividad(actividad_id),
    )


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
    se agrega al ra_abet del curso si falta.
    """
    actividad = _verificar_actividad(actividad_id, usuario["email"], db)

    if CalificacionRepository(db).existen_para_actividad(actividad_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No se puede modificar la rúbrica de '{actividad.nombre}' porque ya "
                   "tiene calificaciones registradas.",
        )

    # Validar suma de pesos antes de persistir
    total_peso = sum(
        c.peso_porcentaje
        for aspecto in body.aspectos
        for c in aspecto.criterios
    )
    if total_peso != Decimal("100"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Los criterios suman {total_peso}%. Deben sumar exactamente 100%.",
        )

    # Validar vínculos ABET y agregar sus RA al curso antes de tocar la rúbrica
    codigos_ra = _validar_codigos_abet((a.codigo_abet for a in body.aspectos), db)
    _agregar_ra_al_curso(actividad, codigos_ra, db)

    # Eliminar aspectos/criterios existentes y reemplazar
    rubrica = RubricaRepository(db)
    rubrica.eliminar_aspectos_de(actividad)

    nuevos_aspectos = []
    for orden_asp, asp_in in enumerate(body.aspectos):
        aspecto = rubrica.agregar_aspecto(Aspecto(
            nombre=asp_in.nombre,
            actividad_id=actividad_id,
            orden=asp_in.orden if asp_in.orden else orden_asp,
            codigo_abet=asp_in.codigo_abet,
        ))

        for orden_crit, crit_in in enumerate(asp_in.criterios):
            rubrica.agregar_criterio(Criterio(
                texto=crit_in.texto,
                peso_porcentaje=crit_in.peso_porcentaje,
                aspecto_id=aspecto.id,
                orden=crit_in.orden if crit_in.orden else orden_crit,
            ))

        nuevos_aspectos.append(aspecto)

    db.commit()

    # Refrescar para obtener criterios con IDs
    for asp in nuevos_aspectos:
        db.refresh(asp)

    aspectos_out = [AspectoOut.model_validate(a) for a in nuevos_aspectos]
    return CriteriosResponse(aspectos=aspectos_out, total_peso=total_peso)


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
    """
    actividad = _verificar_actividad(actividad_id, usuario["email"], db)

    if CalificacionRepository(db).existen_para_actividad(actividad_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No se puede modificar la rúbrica de '{actividad.nombre}' porque ya "
                   "tiene calificaciones registradas.",
        )

    try:
        return parsear_excel_criterios(await archivo.read())
    except ExcelParserError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


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
    """
    actividad = _verificar_actividad(actividad_id, usuario["email"], db)
    aspecto = RubricaRepository(db).get_aspecto(aspecto_id)
    if not aspecto or aspecto.actividad_id != actividad_id:
        raise HTTPException(status_code=404, detail="Aspecto no encontrado en esta actividad")

    codigos_ra = _validar_codigos_abet([body.codigo_abet], db)
    _agregar_ra_al_curso(actividad, codigos_ra, db)
    aspecto.codigo_abet = body.codigo_abet
    db.commit()
    db.refresh(aspecto)
    return AspectoOut.model_validate(aspecto)
