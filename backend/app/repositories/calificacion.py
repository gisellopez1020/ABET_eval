from sqlalchemy import exists, func
from sqlalchemy.orm import Session

from app.models import Actividad, Aspecto, Calificacion, Criterio


class CalificacionRepository:
    def __init__(self, db: Session):
        self.db = db

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
