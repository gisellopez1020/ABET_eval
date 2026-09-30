from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Aspecto, Criterio


class RubricaRepository:
    """Aspectos y criterios de las actividades: la rúbrica se lee y se reemplaza completa."""

    def __init__(self, db: Session):
        self.db = db

    def suma_pesos(self, actividad_id: int):
        """Suma de peso_porcentaje de los criterios de la actividad (0 si no tiene)."""
        return (
            self.db.query(func.coalesce(func.sum(Criterio.peso_porcentaje), 0))
            .join(Aspecto, Criterio.aspecto_id == Aspecto.id)
            .filter(Aspecto.actividad_id == actividad_id)
            .scalar()
        )
