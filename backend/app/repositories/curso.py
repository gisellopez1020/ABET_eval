from typing import List, Optional

from sqlalchemy.orm import Session

from app.models import Curso


class CursoRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, curso_id: int) -> Optional[Curso]:
        return self.db.get(Curso, curso_id)

    def de_docente(self, email: str) -> List[Curso]:
        return self.db.query(Curso).filter(Curso.docente_email == email).all()

    def agregar(self, curso: Curso) -> Curso:
        self.db.add(curso)
        return curso

    def contar_que_usan_ra(self, codigo: str) -> int:
        """
        Cursos (de cualquier docente) cuyo ra_abet contiene el código.
        Se revisa en Python en vez de con operadores jsonb para que sea portable;
        el volumen de cursos es pequeño.
        """
        return sum(1 for (ra_abet,) in self.db.query(Curso.ra_abet).all() if codigo in (ra_abet or []))
