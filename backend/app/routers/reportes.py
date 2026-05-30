from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import (
    Curso, Actividad, Seccion, EquipoTrabajo, Estudiante,
    Calificacion, Criterio, Aspecto,
)
from app.models.actividad import TipoActividad
from app.schemas.reporte import ReporteABETResponse, ReporteRAItem

router = APIRouter(prefix="/reportes", tags=["Reportes ABET"])


def _clasificar_nota(nota: Decimal) -> str:
    if nota < Decimal("3.0"):
        return "0.0-2.9"
    elif nota < Decimal("4.0"):
        return "3.0-3.9"
    else:
        return "4.0-5.0"


def _notas_por_actividad(
    actividad: Actividad,
    seccion_id: Optional[int],
    db: Session,
) -> list[Decimal]:
    """Devuelve lista de notas totales por entidad (equipo o estudiante) para la actividad."""
    notas: list[Decimal] = []

    if actividad.tipo == TipoActividad.grupal:
        query = db.query(EquipoTrabajo).filter(
            EquipoTrabajo.actividad_id == actividad.id
        )
        if seccion_id:
            query = query.filter(EquipoTrabajo.seccion_id == seccion_id)
        for equipo in query.all():
            total = (
                db.query(func.sum(Calificacion.nota_calculada))
                .join(Criterio, Calificacion.criterio_id == Criterio.id)
                .join(Aspecto, Criterio.aspecto_id == Aspecto.id)
                .filter(
                    Calificacion.equipo_id == equipo.id,
                    Aspecto.actividad_id == actividad.id,
                )
                .scalar()
            )
            if total is not None:
                notas.append(total)
    else:
        # Actividad individual
        seccion_ids: list[int] = []
        if seccion_id:
            seccion_ids = [seccion_id]
        else:
            seccion_ids = [
                s.id
                for s in db.query(Seccion).filter(Seccion.curso_id == actividad.curso_id).all()
            ]

        for sid in seccion_ids:
            for est in db.query(Estudiante).filter(Estudiante.seccion_id == sid).all():
                total = (
                    db.query(func.sum(Calificacion.nota_calculada))
                    .join(Criterio, Calificacion.criterio_id == Criterio.id)
                    .join(Aspecto, Criterio.aspecto_id == Aspecto.id)
                    .filter(
                        Calificacion.estudiante_id == est.id,
                        Aspecto.actividad_id == actividad.id,
                    )
                    .scalar()
                )
                if total is not None:
                    notas.append(total)

    return notas


@router.get(
    "/abet/{curso_id}",
    response_model=ReporteABETResponse,
    summary="Reporte ABET por curso",
)
def reporte_abet(
    curso_id: int,
    seccion_id: Optional[int] = Query(default=None),
    actividad_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Genera el reporte ABET del curso.
    Muestra la distribución de notas por rangos (0.0-2.9, 3.0-3.9, 4.0-5.0)
    para cada Resultado de Aprendizaje ABET del curso.

    Parámetros opcionales:
    - seccion_id: filtrar por sección
    - actividad_id: filtrar por actividad específica

    Nota: sin mapeo explícito actividad→RA, se agregan todas las actividades
    del curso para cada RA. Personalizar en versiones futuras.
    """
    curso = db.get(Curso, curso_id)
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    if curso.docente_email != usuario["email"]:
        raise HTTPException(status_code=403, detail="No tiene permiso sobre este curso")

    # Determinar actividades a incluir
    query_act = db.query(Actividad).filter(Actividad.curso_id == curso_id)
    if actividad_id:
        query_act = query_act.filter(Actividad.id == actividad_id)
    actividades = query_act.all()

    # Recopilar todas las notas agregadas
    todas_notas: list[Decimal] = []
    for act in actividades:
        todas_notas.extend(_notas_por_actividad(act, seccion_id, db))

    # Construir distribución por rangos
    rangos: dict[str, int] = {"0.0-2.9": 0, "3.0-3.9": 0, "4.0-5.0": 0}
    for nota in todas_notas:
        rango = _clasificar_nota(nota)
        rangos[rango] += 1

    total = sum(rangos.values())

    # Repetir la distribución para cada RA (sin mapeo explícito)
    ra_list = curso.ra_abet or []
    resultados = [
        ReporteRAItem(ra=ra, rangos=dict(rangos), total=total)
        for ra in ra_list
    ]

    if not resultados:
        resultados = [
            ReporteRAItem(
                ra="Sin resultados de aprendizaje definidos",
                rangos=dict(rangos),
                total=total,
            )
        ]

    return ReporteABETResponse(
        curso_id=curso.id,
        curso_nombre=curso.nombre,
        curso_codigo=curso.codigo,
        periodo=curso.periodo,
        docente_email=curso.docente_email,
        resultados=resultados,
    )
