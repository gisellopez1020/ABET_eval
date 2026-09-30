from typing import Dict, Iterable, Optional

from sqlalchemy.orm import Session

from app.models import RaAbetCatalogo


class RaAbetRepository:
    def __init__(self, db: Session):
        self.db = db

    def padres_de(self, codigos: Iterable[str]) -> Dict[str, Optional[str]]:
        """{codigo: codigo_padre} de los códigos que existen en el catálogo."""
        return dict(
            self.db.query(RaAbetCatalogo.codigo, RaAbetCatalogo.codigo_padre)
            .filter(RaAbetCatalogo.codigo.in_(list(codigos)))
            .all()
        )
