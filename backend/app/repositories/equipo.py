from typing import Dict, Iterable

from sqlalchemy.orm import Session

from app.models import EquipoTrabajo


class EquipoRepository:
    def __init__(self, db: Session):
        self.db = db

    def nombres_por_id(self, ids: Iterable[int]) -> Dict[int, str]:
        return dict(
            self.db.query(EquipoTrabajo.id, EquipoTrabajo.nombre)
            .filter(EquipoTrabajo.id.in_(list(ids)))
            .all()
        )
