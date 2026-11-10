from typing import Iterable, List, Optional

from sqlalchemy.orm import Session

from app.models import Seccion


class SeccionRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, seccion_id: int) -> Optional[Seccion]:
        return self.db.get(Seccion, seccion_id)

    def bloquear(self, seccion_id: int) -> None:
        """
        SELECT ... FOR UPDATE sobre la sección, hasta el commit o el rollback: serializa
        las altas e importaciones de una misma sección para que la comprobación de
        códigos repetidos y el guardado no se crucen (no hay UNIQUE posible: los códigos
        están cifrados con un vector aleatorio). SQLite lo ignora: las pruebas no lo cubren.
        """
        self.db.query(Seccion.id).filter(Seccion.id == seccion_id).with_for_update().one_or_none()

    def de_curso(self, curso_id: int, ids: Optional[Iterable[int]] = None) -> List[Seccion]:
        """Secciones del curso (activas o no), solo las de `ids` si se dan, por id."""
        query = self.db.query(Seccion).filter(Seccion.curso_id == curso_id)
        if ids is not None:
            query = query.filter(Seccion.id.in_(list(ids)))
        return query.order_by(Seccion.id).all()

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
