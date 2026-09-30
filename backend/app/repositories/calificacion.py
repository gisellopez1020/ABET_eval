from decimal import Decimal
from typing import List, Optional

from sqlalchemy import exists, func
from sqlalchemy.orm import Session

from app.models import Actividad, Aspecto, Calificacion, Criterio


class CalificacionRepository:
    def __init__(self, db: Session):
        self.db = db

    def _en_actividad(self, columnas, actividad_id: int):
        """Consulta sobre las calificaciones de los criterios de la actividad."""
        return (
            self.db.query(*columnas)
            .select_from(Calificacion)
            .join(Criterio, Calificacion.criterio_id == Criterio.id)
            .join(Aspecto, Criterio.aspecto_id == Aspecto.id)
            .filter(Aspecto.actividad_id == actividad_id)
        )

    def contar_de_equipo(self, equipo_id: int, actividad_id: int) -> int:
        """Criterios de la actividad que el equipo tiene calificados."""
        return (
            self._en_actividad([func.count(Calificacion.id)], actividad_id)
            .filter(Calificacion.equipo_id == equipo_id)
            .scalar()
            or 0
        )

    def contar_de_estudiante(self, estudiante_id: int, actividad_id: int) -> int:
        """Criterios de la actividad que el estudiante tiene calificados individualmente."""
        return (
            self._en_actividad([func.count(Calificacion.id)], actividad_id)
            .filter(Calificacion.estudiante_id == estudiante_id)
            .scalar()
            or 0
        )

    def suma_notas_de_equipo(self, equipo_id: int, actividad_id: int) -> Optional[Decimal]:
        """Suma de nota_calculada del equipo en la actividad; None si no tiene calificaciones."""
        return (
            self._en_actividad([func.sum(Calificacion.nota_calculada)], actividad_id)
            .filter(Calificacion.equipo_id == equipo_id)
            .scalar()
        )

    def suma_notas_de_estudiante(self, estudiante_id: int, actividad_id: int) -> Optional[Decimal]:
        """Suma de nota_calculada del estudiante en la actividad; None si no tiene calificaciones."""
        return (
            self._en_actividad([func.sum(Calificacion.nota_calculada)], actividad_id)
            .filter(Calificacion.estudiante_id == estudiante_id)
            .scalar()
        )

    def get(self, calificacion_id: int) -> Optional[Calificacion]:
        return self.db.get(Calificacion, calificacion_id)

    def de_equipo(self, equipo_id: int, actividad_id: int) -> List[Calificacion]:
        """Calificaciones guardadas del equipo en los criterios de la actividad."""
        return self._en_actividad([Calificacion], actividad_id).filter(Calificacion.equipo_id == equipo_id).all()

    def de_estudiante(self, estudiante_id: int, actividad_id: int) -> List[Calificacion]:
        """Calificaciones individuales del estudiante en los criterios de la actividad."""
        return (
            self._en_actividad([Calificacion], actividad_id)
            .filter(Calificacion.estudiante_id == estudiante_id)
            .all()
        )

    def de_criterio_y_equipo(self, criterio_id: int, equipo_id: int) -> Optional[Calificacion]:
        return (
            self.db.query(Calificacion)
            .filter(Calificacion.criterio_id == criterio_id, Calificacion.equipo_id == equipo_id)
            .first()
        )

    def de_criterio_y_estudiante(self, criterio_id: int, estudiante_id: int) -> Optional[Calificacion]:
        return (
            self.db.query(Calificacion)
            .filter(Calificacion.criterio_id == criterio_id, Calificacion.estudiante_id == estudiante_id)
            .first()
        )

    def agregar(self, calificacion: Calificacion) -> Calificacion:
        self.db.add(calificacion)
        self.db.flush()
        return calificacion

    def actualizar(self, calificacion: Calificacion, valor: int, nota_calculada: Decimal) -> Calificacion:
        """Cambia el valor y la nota; el flush deja updated_at al día para la respuesta."""
        calificacion.valor = valor
        calificacion.nota_calculada = nota_calculada
        self.db.flush()
        return calificacion

    def existen_para_actividad(self, actividad_id: int) -> bool:
        return self.db.query(
            exists().where(
                Calificacion.criterio_id == Criterio.id,
                Criterio.aspecto_id == Aspecto.id,
                Aspecto.actividad_id == actividad_id,
            )
        ).scalar()

    def ultimas_del_curso(self, curso_id: int, limit: int):
        """
        Filas (actividad_id, actividad_nombre, equipo_id, estudiante_id, ultimo): el
        updated_at más reciente por (actividad, equipo o estudiante), del más nuevo al más viejo.
        """
        ultimo = func.max(Calificacion.updated_at).label("ultimo")
        return (
            self.db.query(
                Actividad.id.label("actividad_id"),
                Actividad.nombre.label("actividad_nombre"),
                Calificacion.equipo_id,
                Calificacion.estudiante_id,
                ultimo,
            )
            .join(Criterio, Calificacion.criterio_id == Criterio.id)
            .join(Aspecto, Criterio.aspecto_id == Aspecto.id)
            .join(Actividad, Aspecto.actividad_id == Actividad.id)
            .filter(Actividad.curso_id == curso_id)
            .group_by(Actividad.id, Actividad.nombre, Calificacion.equipo_id, Calificacion.estudiante_id)
            .order_by(ultimo.desc(), Actividad.id.desc())
            .limit(limit)
            .all()
        )
