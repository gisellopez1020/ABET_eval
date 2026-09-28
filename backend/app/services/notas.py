"""
Promedio ponderado de estudiantes a través de las actividades calificadas de su curso.
"""
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Actividad, Aspecto, Calificacion, Criterio, EquipoTrabajo, MiembroEquipo
from app.models.actividad import TipoActividad

DOS_DECIMALES = Decimal("0.01")


def promedios_estudiantes(
    db: Session, curso_id: int, estudiante_ids: Iterable[int]
) -> dict[int, Optional[Decimal]]:
    """
    Promedio 0-5 de cada estudiante: sum(nota_actividad * peso_nota_final) / sum(peso_nota_final)
    sobre las actividades del curso que tiene calificadas por completo (todos sus criterios).
    Las pendientes o a medio calificar se excluyen y el peso se renormaliza.

    La nota de una actividad es la suma de nota_calculada de sus criterios (misma fórmula
    que _nota_total en calificaciones.py). En una actividad individual cuenta la calificación
    del propio estudiante; en una grupal, la de su equipo. None si no tiene ninguna calificada.
    Se resuelve con consultas agrupadas, no una por estudiante.
    """
    estudiante_ids = list(estudiante_ids)
    if not estudiante_ids:
        return {}

    actividades = {
        a.id: a for a in db.query(Actividad).filter(Actividad.curso_id == curso_id).all()
    }
    total_criterios = dict(
        db.query(Aspecto.actividad_id, func.count(Criterio.id))
        .join(Criterio, Criterio.aspecto_id == Aspecto.id)
        .filter(Aspecto.actividad_id.in_(actividades))
        .group_by(Aspecto.actividad_id)
        .all()
    ) if actividades else {}

    def _sumas(columna, ids):
        """{(entidad_id, actividad_id): nota} solo de las actividades calificadas por completo."""
        if not ids or not actividades:
            return {}
        filas = (
            db.query(columna, Aspecto.actividad_id, func.sum(Calificacion.nota_calculada), func.count(Calificacion.id))
            .join(Criterio, Calificacion.criterio_id == Criterio.id)
            .join(Aspecto, Criterio.aspecto_id == Aspecto.id)
            .filter(columna.in_(ids), Aspecto.actividad_id.in_(actividades))
            .group_by(columna, Aspecto.actividad_id)
            .all()
        )
        return {
            (entidad_id, actividad_id): Decimal(str(suma))
            for entidad_id, actividad_id, suma, cantidad in filas
            if total_criterios.get(actividad_id, 0) > 0 and cantidad >= total_criterios[actividad_id]
        }

    notas_individuales = _sumas(Calificacion.estudiante_id, estudiante_ids)

    membresias = (
        db.query(MiembroEquipo.estudiante_id, EquipoTrabajo.id, EquipoTrabajo.actividad_id)
        .join(EquipoTrabajo, MiembroEquipo.equipo_id == EquipoTrabajo.id)
        .filter(MiembroEquipo.estudiante_id.in_(estudiante_ids), EquipoTrabajo.actividad_id.in_(actividades))
        .all()
    ) if actividades else []
    notas_equipos = _sumas(Calificacion.equipo_id, {equipo_id for _, equipo_id, _ in membresias})

    # {estudiante_id: {actividad_id: [notas]}} (más de una solo si está en dos equipos de la misma actividad)
    notas: dict[int, dict[int, list[Decimal]]] = defaultdict(lambda: defaultdict(list))
    for (eid, actividad_id), nota in notas_individuales.items():
        if actividades[actividad_id].tipo == TipoActividad.individual:
            notas[eid][actividad_id].append(nota)
    for eid, equipo_id, actividad_id in membresias:
        nota = notas_equipos.get((equipo_id, actividad_id))
        if nota is not None and actividades[actividad_id].tipo == TipoActividad.grupal:
            notas[eid][actividad_id].append(nota)

    resultado: dict[int, Optional[Decimal]] = {}
    for eid in estudiante_ids:
        suma_pn = Decimal(0)
        suma_p = Decimal(0)
        for actividad_id, lista in notas.get(eid, {}).items():
            peso = Decimal(str(actividades[actividad_id].peso_nota_final))
            suma_pn += peso * sum(lista) / len(lista)
            suma_p += peso
        resultado[eid] = (suma_pn / suma_p).quantize(DOS_DECIMALES, rounding=ROUND_HALF_UP) if suma_p > 0 else None
    return resultado
