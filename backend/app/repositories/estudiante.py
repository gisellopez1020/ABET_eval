from typing import Dict, Iterable, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models import Curso, Estudiante, Seccion


class EstudianteRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, estudiante_id: int) -> Optional[Estudiante]:
        return self.db.get(Estudiante, estudiante_id)

    def de_seccion(self, seccion_id: int) -> List[Estudiante]:
        """Estudiantes de la sección ordenados por nombre completo."""
        return (
            self.db.query(Estudiante)
            .filter(Estudiante.seccion_id == seccion_id)
            .order_by(Estudiante.nombre_completo)
            .all()
        )

    def de_curso(self, curso_id: int, seccion_id: Optional[int] = None) -> List[Estudiante]:
        """Estudiantes del curso (o solo de la sección) ordenados por nombre completo."""
        query = self._de_curso(self.db.query(Estudiante), curso_id, seccion_id)
        return query.order_by(Estudiante.nombre_completo).all()

    def ids_de_curso(self, curso_id: int, seccion_id: Optional[int] = None) -> List[int]:
        return [eid for (eid,) in self._de_curso(self.db.query(Estudiante.id), curso_id, seccion_id).all()]

    @staticmethod
    def _de_curso(query, curso_id: int, seccion_id: Optional[int]):
        query = query.join(Seccion, Estudiante.seccion_id == Seccion.id).filter(Seccion.curso_id == curso_id)
        if seccion_id:
            query = query.filter(Estudiante.seccion_id == seccion_id)
        return query

    def para_exportar(
        self,
        docente_email: str,
        *,
        curso_id: Optional[int] = None,
        seccion_id: Optional[int] = None,
        solo_activas: bool = True,
    ) -> List[Tuple[Estudiante, Seccion, Curso]]:
        """(estudiante, sección, curso) de los cursos del docente, por asignatura, sección y nombre."""
        query = (
            self.db.query(Estudiante, Seccion, Curso)
            .join(Seccion, Estudiante.seccion_id == Seccion.id)
            .join(Curso, Seccion.curso_id == Curso.id)
            .filter(Curso.docente_email == docente_email)
        )
        if seccion_id is not None:
            query = query.filter(Seccion.id == seccion_id)
        if solo_activas:
            query = query.filter(Seccion.activo == True)  # noqa: E712
        if curso_id is not None:
            query = query.filter(Curso.id == curso_id)
        return query.order_by(Curso.nombre, Seccion.nombre, Estudiante.nombre_completo).all()

    def nombres_por_id(self, ids: Iterable[int]) -> Dict[int, str]:
        return dict(
            self.db.query(Estudiante.id, Estudiante.nombre_completo)
            .filter(Estudiante.id.in_(list(ids)))
            .all()
        )

    def agregar(self, estudiante: Estudiante) -> Estudiante:
        self.db.add(estudiante)
        return estudiante

    def agregar_varios(self, estudiantes: List[Estudiante]) -> None:
        self.db.add_all(estudiantes)

    def eliminar(self, estudiante: Estudiante) -> None:
        self.db.delete(estudiante)
