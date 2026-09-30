from decimal import Decimal
from typing import List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Actividad, Aspecto, Criterio


class ActividadRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, actividad_id: int) -> Optional[Actividad]:
        return self.db.get(Actividad, actividad_id)

    def de_curso_con_total_peso(self, curso_id: int) -> List[Tuple[Actividad, Decimal]]:
        """(actividad, suma de pesos de sus criterios) del curso, por fecha de creación, en una consulta."""
        return (
            self.db.query(Actividad, func.coalesce(func.sum(Criterio.peso_porcentaje), 0))
            .outerjoin(Aspecto, Aspecto.actividad_id == Actividad.id)
            .outerjoin(Criterio, Criterio.aspecto_id == Aspecto.id)
            .filter(Actividad.curso_id == curso_id)
            .group_by(Actividad.id)
            .order_by(Actividad.created_at)
            .all()
        )

    def agregar(self, actividad: Actividad) -> Actividad:
        self.db.add(actividad)
        self.db.flush()
        return actividad

    def eliminar(self, actividad: Actividad) -> None:
        self.db.delete(actividad)
