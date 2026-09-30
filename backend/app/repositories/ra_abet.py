from typing import Dict, Iterable, List, Optional

from sqlalchemy.orm import Session

from app.models import RaAbetCatalogo


class RaAbetRepository:
    """Catálogo global de Resultados de Aprendizaje y Criterios ABET."""

    def __init__(self, db: Session):
        self.db = db

    def get(self, codigo: str) -> Optional[RaAbetCatalogo]:
        return self.db.get(RaAbetCatalogo, codigo)

    def listar(self, solo_raiz: bool = False) -> List[RaAbetCatalogo]:
        """Catálogo ordenado por código; con solo_raiz, solo los Resultados de Aprendizaje."""
        query = self.db.query(RaAbetCatalogo)
        if solo_raiz:
            query = query.filter(RaAbetCatalogo.codigo_padre.is_(None))
        return query.order_by(RaAbetCatalogo.codigo).all()

    def por_codigo(self) -> Dict[str, RaAbetCatalogo]:
        """Todo el catálogo indexado por código."""
        return {ra.codigo: ra for ra in self.db.query(RaAbetCatalogo).all()}

    def padres_de(self, codigos: Iterable[str]) -> Dict[str, Optional[str]]:
        """{codigo: codigo_padre} de los códigos que existen en el catálogo."""
        return dict(
            self.db.query(RaAbetCatalogo.codigo, RaAbetCatalogo.codigo_padre)
            .filter(RaAbetCatalogo.codigo.in_(list(codigos)))
            .all()
        )

    def por_codigos(self, codigos: Iterable[str]) -> List[RaAbetCatalogo]:
        return self.db.query(RaAbetCatalogo).filter(RaAbetCatalogo.codigo.in_(list(codigos))).all()

    def hijos_de(self, codigos_padre: Iterable[str]) -> List[RaAbetCatalogo]:
        """Criterios cuyo RA padre está entre codigos_padre."""
        return self.db.query(RaAbetCatalogo).filter(RaAbetCatalogo.codigo_padre.in_(list(codigos_padre))).all()

    def contar_hijos(self, codigo: str) -> int:
        return self.db.query(RaAbetCatalogo).filter(RaAbetCatalogo.codigo_padre == codigo).count()

    def agregar(self, ra: RaAbetCatalogo) -> RaAbetCatalogo:
        self.db.add(ra)
        return ra

    def flush(self) -> None:
        """Envía a la BD lo pendiente (la importación lo usa para insertar los RA antes que sus Criterios)."""
        self.db.flush()

    def eliminar(self, ra: RaAbetCatalogo) -> None:
        self.db.delete(ra)
