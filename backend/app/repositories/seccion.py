from typing import List, Optional

from sqlalchemy.orm import Session

from app.models import Seccion


class SeccionRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, seccion_id: int) -> Optional[Seccion]:
        return self.db.get(Seccion, seccion_id)

    def activas_de_curso(self, curso_id: int) -> List[Seccion]:
        return (
            self.db.query(Seccion)
            .filter(Seccion.curso_id == curso_id, Seccion.activo == True)  # noqa: E712
            .all()
        )

    def agregar(self, seccion: Seccion) -> Seccion:
        self.db.add(seccion)
        return seccion

    def eliminar(self, seccion: Seccion) -> None:
        self.db.delete(seccion)
