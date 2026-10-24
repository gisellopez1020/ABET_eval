from typing import Optional

from sqlalchemy.orm import Session

from app.models import Retroalimentacion


class RetroalimentacionRepository:
    def __init__(self, db: Session):
        self.db = db

    def de(
        self, actividad_id: int, equipo_id: Optional[int], estudiante_id: Optional[int],
    ) -> Optional[Retroalimentacion]:
        """La guardada del equipo o del estudiante (uno de los dos es None) en la actividad."""
        return (
            self.db.query(Retroalimentacion)
            .filter_by(actividad_id=actividad_id, equipo_id=equipo_id, estudiante_id=estudiante_id)
            .one_or_none()
        )

    def agregar(self, retro: Retroalimentacion) -> Retroalimentacion:
        self.db.add(retro)
        return retro
