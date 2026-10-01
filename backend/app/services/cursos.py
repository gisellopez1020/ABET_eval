"""
Reglas de negocio de los cursos del docente. Lanza errores de app/services/errores.py
(nunca HTTPException) y es dueño de la transacción: hace commit al terminar cada operación.
"""
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.models import Curso
from app.repositories.calificacion import CalificacionRepository
from app.repositories.curso import CursoRepository
from app.repositories.equipo import EquipoRepository
from app.repositories.estudiante import EstudianteRepository
from app.repositories.ra_abet import RaAbetRepository
from app.schemas import ActividadRecienteItem
from app.services.errores import (
    CursoConCriteriosAbet, CursoNoEncontrado, RaAbetDesconocidos, SinPermiso,
)


class CursoService:
    def __init__(self, db: Session):
        self.db = db
        self.cursos = CursoRepository(db)

    def listar(self, docente_email: str) -> List[Curso]:
        """Todos los cursos (activos e inactivos) del docente."""
        return self.cursos.de_docente(docente_email)

    def obtener(self, curso_id: int, docente_email: str) -> Curso:
        return self._curso_del_docente(curso_id, docente_email)

    def crear(self, docente_email: str, datos: Dict[str, Any]) -> Curso:
        self._validar_ra_abet(datos.get("ra_abet"))
        curso = self.cursos.agregar(Curso(**datos, docente_email=docente_email))
        self.db.commit()
        self.db.refresh(curso)
        return curso

    def editar(self, curso_id: int, docente_email: str, cambios: Dict[str, Any]) -> Curso:
        """
        Aplica solo los campos de `cambios`. ra_abet se valida únicamente si viene:
        un curso con valores antiguos fuera del catálogo puede editarse sin tocarlos.
        """
        curso = self._curso_del_docente(curso_id, docente_email)
        if "ra_abet" in cambios:
            self._validar_ra_abet(cambios["ra_abet"])
        for campo, valor in cambios.items():
            setattr(curso, campo, valor)
        self.db.commit()
        self.db.refresh(curso)
        return curso

    def archivar(self, curso_id: int, docente_email: str) -> Curso:
        """Marca el curso como inactivo. No elimina datos."""
        return self._cambiar_activo(curso_id, docente_email, False)

    def activar(self, curso_id: int, docente_email: str) -> Curso:
        """Revierte el archivado (activar uno ya activo no hace nada distinto)."""
        return self._cambiar_activo(curso_id, docente_email, True)

    def actividad_reciente(self, curso_id: int, docente_email: str, limit: int) -> List[ActividadRecienteItem]:
        """
        Últimos guardados o ediciones de calificaciones del curso, del más reciente
        al más antiguo. Un guardado escribe una fila por criterio, así que se agrupa
        por (actividad, equipo o estudiante) y se toma el updated_at más reciente.
        """
        self._curso_del_docente(curso_id, docente_email)
        filas = CalificacionRepository(self.db).ultimas_del_curso(curso_id, limit)

        equipo_ids = {f.equipo_id for f in filas if f.equipo_id is not None}
        estudiante_ids = {f.estudiante_id for f in filas if f.estudiante_id is not None}
        equipos = EquipoRepository(self.db).nombres_por_id(equipo_ids)
        estudiantes = EstudianteRepository(self.db).nombres_por_id(estudiante_ids)

        return [
            ActividadRecienteItem(
                actividad_id=f.actividad_id,
                actividad_nombre=f.actividad_nombre,
                tipo="equipo" if f.equipo_id is not None else "estudiante",
                nombre=equipos[f.equipo_id] if f.equipo_id is not None else estudiantes[f.estudiante_id],
                updated_at=f.ultimo,
            )
            for f in filas
        ]

    def _cambiar_activo(self, curso_id: int, docente_email: str, activo: bool) -> Curso:
        curso = self._curso_del_docente(curso_id, docente_email)
        curso.activo = activo
        self.db.commit()
        self.db.refresh(curso)
        return curso

    def _curso_del_docente(self, curso_id: int, email: str) -> Curso:
        curso = self.cursos.get(curso_id)
        if not curso:
            raise CursoNoEncontrado()
        if curso.docente_email != email:
            raise SinPermiso("No tiene permiso para acceder a este curso")
        return curso

    def _validar_ra_abet(self, codigos: List[str] | None) -> None:
        """
        Cada código de ra_abet debe existir en ra_abet_catalogo y ser un Resultado de
        Aprendizaje (nivel superior): un curso no selecciona Criterios individuales.
        """
        if not codigos:
            return
        padres = RaAbetRepository(self.db).padres_de(codigos)
        desconocidos = [c for c in codigos if c not in padres]
        if desconocidos:
            raise RaAbetDesconocidos(desconocidos)
        criterios = [c for c in codigos if padres[c] is not None]
        if criterios:
            raise CursoConCriteriosAbet(criterios)
