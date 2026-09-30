from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Actividad, Aspecto, Criterio


class RubricaRepository:
    """Aspectos y criterios de las actividades: la rúbrica se lee y se reemplaza completa."""

    def __init__(self, db: Session):
        self.db = db

    def get_aspecto(self, aspecto_id: int) -> Optional[Aspecto]:
        return self.db.get(Aspecto, aspecto_id)

    def eliminar_aspectos_de(self, actividad: Actividad) -> None:
        """Borra los aspectos de la actividad (y sus criterios en cascada) y hace flush."""
        for aspecto in actividad.aspectos:
            self.db.delete(aspecto)
        self.db.flush()

    def agregar_aspecto(self, aspecto: Aspecto) -> Aspecto:
        self.db.add(aspecto)
        self.db.flush()
        return aspecto

    def agregar_criterio(self, criterio: Criterio) -> Criterio:
        self.db.add(criterio)
        self.db.flush()
        return criterio

    def suma_pesos(self, actividad_id: int):
        """Suma de peso_porcentaje de los criterios de la actividad (0 si no tiene)."""
        return (
            self.db.query(func.coalesce(func.sum(Criterio.peso_porcentaje), 0))
            .join(Aspecto, Criterio.aspecto_id == Aspecto.id)
            .filter(Aspecto.actividad_id == actividad_id)
            .scalar()
        )

    def contar_aspectos_con_codigo(self, codigo_abet: str) -> int:
        """Aspectos de rúbrica (de cualquier docente) vinculados al código."""
        return self.db.query(Aspecto).filter(Aspecto.codigo_abet == codigo_abet).count()
