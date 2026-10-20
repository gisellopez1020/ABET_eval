from typing import Dict, Iterable, List, Optional

from sqlalchemy.orm import Session

from app.models import RaAbetCatalogo
from app.models.ra_abet_catalogo import PROGRAMA_DEFAULT


class RaAbetRepository:
    """Catálogo compartido, consultado dentro de la carrera correspondiente."""

    def __init__(self, db: Session):
        self.db = db

    def get(self, codigo: str, programa: str = PROGRAMA_DEFAULT) -> Optional[RaAbetCatalogo]:
        return self.db.get(RaAbetCatalogo, (programa, codigo))

    def listar(self, solo_raiz: bool = False, programa: Optional[str] = None) -> List[RaAbetCatalogo]:
        """Catálogo ordenado por código; con solo_raiz, solo los Resultados de Aprendizaje."""
        query = self.db.query(RaAbetCatalogo)
        if programa is not None:
            query = query.filter(RaAbetCatalogo.programa == programa)
        if solo_raiz:
            query = query.filter(RaAbetCatalogo.codigo_padre.is_(None))
        return query.order_by(RaAbetCatalogo.codigo).all()

    def por_codigo(self, programa: str = PROGRAMA_DEFAULT) -> Dict[str, RaAbetCatalogo]:
        """Todo el catálogo indexado por código."""
        return {
            ra.codigo: ra
            for ra in self.db.query(RaAbetCatalogo).filter(RaAbetCatalogo.programa == programa).all()
        }

    def padres_de(
        self, codigos: Iterable[str], programa: str = PROGRAMA_DEFAULT,
    ) -> Dict[str, Optional[str]]:
        """{codigo: codigo_padre} de los códigos que existen en el catálogo."""
        return dict(
            self.db.query(RaAbetCatalogo.codigo, RaAbetCatalogo.codigo_padre)
            .filter(RaAbetCatalogo.codigo.in_(list(codigos)))
            .filter(RaAbetCatalogo.programa == programa)
            .all()
        )

    def por_codigos(
        self, codigos: Iterable[str], programa: str = PROGRAMA_DEFAULT,
    ) -> List[RaAbetCatalogo]:
        return (
            self.db.query(RaAbetCatalogo)
            .filter(RaAbetCatalogo.codigo.in_(list(codigos)), RaAbetCatalogo.programa == programa)
            .all()
        )

    def hijos_de(
        self, codigos_padre: Iterable[str], programa: str = PROGRAMA_DEFAULT,
    ) -> List[RaAbetCatalogo]:
        """Criterios cuyo RA padre está entre codigos_padre."""
        return (
            self.db.query(RaAbetCatalogo)
            .filter(
                RaAbetCatalogo.codigo_padre.in_(list(codigos_padre)),
                RaAbetCatalogo.programa == programa,
            )
            .all()
        )

    def contar_hijos(self, codigo: str, programa: str = PROGRAMA_DEFAULT) -> int:
        return (
            self.db.query(RaAbetCatalogo)
            .filter(RaAbetCatalogo.codigo_padre == codigo, RaAbetCatalogo.programa == programa)
            .count()
        )

    def agregar(self, ra: RaAbetCatalogo) -> RaAbetCatalogo:
        self.db.add(ra)
        return ra

    def flush(self) -> None:
        """Envía a la BD lo pendiente (la importación lo usa para insertar los RA antes que sus Criterios)."""
        self.db.flush()

    def eliminar(self, ra: RaAbetCatalogo) -> None:
        self.db.delete(ra)
