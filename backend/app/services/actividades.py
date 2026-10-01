"""
Reglas de negocio de las actividades de un curso. Lanza errores de app/services/errores.py
(nunca HTTPException) y es dueño de la transacción: hace commit al terminar cada operación.
"""
from decimal import Decimal
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.models import Actividad, Curso
from app.repositories.actividad import ActividadRepository
from app.repositories.calificacion import CalificacionRepository
from app.repositories.curso import CursoRepository
from app.repositories.rubrica import RubricaRepository
from app.schemas import ActividadOut
from app.schemas.actividad import ActividadDetalleOut
from app.schemas.criterio import AspectoOut
from app.services.acceso import actividad_del_docente
from app.services.errores import ActividadConCalificaciones, CursoNoEncontrado, SinPermiso


class ActividadService:
    def __init__(self, db: Session):
        self.db = db
        self.cursos = CursoRepository(db)
        self.actividades = ActividadRepository(db)

    def listar(self, curso_id: int, docente_email: str) -> List[ActividadOut]:
        """
        Actividades del curso por fecha de creación, con la suma de pesos de sus
        criterios calculada en una sola consulta.
        """
        self._curso_del_docente(curso_id, docente_email)
        return [
            self._con_total(actividad, total)
            for actividad, total in self.actividades.de_curso_con_total_peso(curso_id)
        ]

    def crear(self, curso_id: int, docente_email: str, datos: Dict[str, Any]) -> Actividad:
        """Una actividad nueva no tiene rúbrica: su total de pesos es el valor por defecto (0)."""
        self._curso_del_docente(curso_id, docente_email)
        actividad = self.actividades.agregar(Actividad(**datos, curso_id=curso_id))
        self.db.commit()
        self.db.refresh(actividad)
        return actividad

    def obtener(self, actividad_id: int, docente_email: str) -> ActividadDetalleOut:
        """La actividad con su total de pesos y sus aspectos y criterios anidados."""
        actividad = self._actividad_del_docente(actividad_id, docente_email)
        return ActividadDetalleOut(
            **self._con_total(actividad, RubricaRepository(self.db).suma_pesos(actividad_id)).model_dump(),
            aspectos=[AspectoOut.model_validate(a) for a in actividad.aspectos],
        )

    def editar(self, actividad_id: int, docente_email: str, cambios: Dict[str, Any]) -> ActividadOut:
        """Aplica solo los campos de `cambios` (nombre y/o peso en la nota final)."""
        actividad = self._actividad_del_docente(actividad_id, docente_email)
        for campo, valor in cambios.items():
            setattr(actividad, campo, valor)
        self.db.commit()
        self.db.refresh(actividad)
        return self._con_total(actividad, RubricaRepository(self.db).suma_pesos(actividad_id))

    def eliminar(self, actividad_id: int, docente_email: str) -> None:
        """Solo se elimina una actividad sin calificaciones (se borrarían en cascada)."""
        actividad = self._actividad_del_docente(actividad_id, docente_email)
        if CalificacionRepository(self.db).existen_para_actividad(actividad_id):
            raise ActividadConCalificaciones(actividad.nombre)
        self.actividades.eliminar(actividad)
        self.db.commit()

    @staticmethod
    def _con_total(actividad: Actividad, total_peso: Decimal) -> ActividadOut:
        return ActividadOut.model_validate(actividad).model_copy(update={"total_peso_criterios": total_peso})

    def _curso_del_docente(self, curso_id: int, email: str) -> Curso:
        curso = self.cursos.get(curso_id)
        if not curso:
            raise CursoNoEncontrado()
        if curso.docente_email != email:
            raise SinPermiso("No tiene permiso sobre este curso")
        return curso

    def _actividad_del_docente(self, actividad_id: int, email: str) -> Actividad:
        return actividad_del_docente(self.actividades, self.cursos, actividad_id, email)
