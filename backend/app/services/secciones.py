"""
Reglas de negocio de las secciones de un curso. Lanza errores de app/services/errores.py
(nunca HTTPException) y es dueño de la transacción: hace commit al terminar cada operación.
"""
from typing import List

from sqlalchemy.orm import Session

from app.models import Curso, Seccion
from app.repositories.curso import CursoRepository
from app.repositories.seccion import SeccionRepository
from app.services.acceso import curso_del_docente
from app.services.errores import SeccionConEstudiantes, SeccionNoEncontrada


class SeccionService:
    def __init__(self, db: Session):
        self.db = db
        self.cursos = CursoRepository(db)
        self.secciones = SeccionRepository(db)

    def listar(self, curso_id: int, docente_email: str) -> List[Seccion]:
        """Secciones activas del curso."""
        self._curso_del_docente(curso_id, docente_email)
        return self.secciones.activas_de_curso(curso_id)

    def crear(self, curso_id: int, docente_email: str, nombre: str) -> Seccion:
        self._curso_del_docente(curso_id, docente_email)
        seccion = self.secciones.agregar(Seccion(nombre=nombre, curso_id=curso_id))
        self.db.commit()
        self.db.refresh(seccion)
        return seccion

    def renombrar(self, seccion_id: int, docente_email: str, nombre: str) -> Seccion:
        seccion = self._seccion_del_docente(seccion_id, docente_email)
        seccion.nombre = nombre
        self.db.commit()
        self.db.refresh(seccion)
        return seccion

    def eliminar(self, seccion_id: int, docente_email: str) -> None:
        """Solo se elimina una sección sin estudiantes registrados."""
        seccion = self._seccion_del_docente(seccion_id, docente_email)
        if seccion.estudiantes:
            raise SeccionConEstudiantes(seccion.nombre, len(seccion.estudiantes))
        self.secciones.eliminar(seccion)
        self.db.commit()

    def _curso_del_docente(self, curso_id: int, email: str) -> Curso:
        return curso_del_docente(self.cursos, curso_id, email)

    def _seccion_del_docente(self, seccion_id: int, email: str) -> Seccion:
        seccion = self.secciones.get(seccion_id)
        if not seccion:
            raise SeccionNoEncontrada()
        self._curso_del_docente(seccion.curso_id, email)
        return seccion
