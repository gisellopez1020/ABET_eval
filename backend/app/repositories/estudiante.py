from typing import Dict, Iterable

from sqlalchemy.orm import Session

from app.models import Estudiante


class EstudianteRepository:
    def __init__(self, db: Session):
        self.db = db

    def nombres_por_id(self, ids: Iterable[int]) -> Dict[int, str]:
        return dict(
            self.db.query(Estudiante.id, Estudiante.nombre_completo)
            .filter(Estudiante.id.in_(list(ids)))
            .all()
        )
