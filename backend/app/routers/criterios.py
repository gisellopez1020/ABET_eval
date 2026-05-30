from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import Curso, Actividad, Aspecto, Criterio
from app.schemas.criterio import CriteriosPayload, CriteriosResponse, AspectoOut

router = APIRouter(tags=["Criterios"])


def _verificar_actividad(actividad_id: int, email: str, db: Session) -> Actividad:
    actividad = db.get(Actividad, actividad_id)
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    curso = db.get(Curso, actividad.curso_id)
    if not curso or curso.docente_email != email:
        raise HTTPException(status_code=403, detail="No tiene permiso sobre esta actividad")
    return actividad


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
    """Devuelve los criterios de la actividad agrupados por aspecto con el total de pesos."""
    actividad = _verificar_actividad(actividad_id, usuario["email"], db)
    aspectos_out = [AspectoOut.model_validate(a) for a in actividad.aspectos]
    total = sum(
        c.peso_porcentaje
        for a in actividad.aspectos
        for c in a.criterios
    )
    return CriteriosResponse(aspectos=aspectos_out, total_peso=total)


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
    """
    actividad = _verificar_actividad(actividad_id, usuario["email"], db)

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

    # Eliminar aspectos/criterios existentes y reemplazar
    for aspecto_existente in actividad.aspectos:
        db.delete(aspecto_existente)
    db.flush()

    nuevos_aspectos = []
    for orden_asp, asp_in in enumerate(body.aspectos):
        aspecto = Aspecto(
            nombre=asp_in.nombre,
            actividad_id=actividad_id,
            orden=asp_in.orden if asp_in.orden else orden_asp,
        )
        db.add(aspecto)
        db.flush()

        for orden_crit, crit_in in enumerate(asp_in.criterios):
            criterio = Criterio(
                texto=crit_in.texto,
                peso_porcentaje=crit_in.peso_porcentaje,
                aspecto_id=aspecto.id,
                orden=crit_in.orden if crit_in.orden else orden_crit,
            )
            db.add(criterio)

        nuevos_aspectos.append(aspecto)

    db.commit()

    # Refrescar para obtener criterios con IDs
    for asp in nuevos_aspectos:
        db.refresh(asp)

    aspectos_out = [AspectoOut.model_validate(a) for a in nuevos_aspectos]
    return CriteriosResponse(aspectos=aspectos_out, total_peso=total_peso)
