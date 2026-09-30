from typing import List, Optional

from sqlalchemy.orm import Session

from app.models import Curso


class CursoRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, curso_id: int) -> Optional[Curso]:
        return self.db.get(Curso, curso_id)
