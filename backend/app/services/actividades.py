"""
Reglas de negocio de las actividades de un curso. Lanza errores de app/services/errores.py
(nunca HTTPException) y es dueño de la transacción: hace commit al terminar cada operación.
"""
from decimal import Decimal
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.models import Actividad, Curso, Seccion
from app.repositories.actividad import ActividadRepository
from app.repositories.calificacion import CalificacionRepository
from app.repositories.curso import CursoRepository
from app.repositories.equipo import EquipoRepository
from app.repositories.rubrica import RubricaRepository
from app.repositories.seccion import SeccionRepository
from app.schemas import ActividadOut
from app.schemas.actividad import ActividadDetalleOut
from app.schemas.criterio import AspectoOut
from app.services.acceso import actividad_del_docente, curso_del_docente
from app.services.errores import ActividadConCalificaciones, SeccionConTrabajoEnActividad, SeccionesFueraDelCurso


class ActividadService:
    def __init__(self, db: Session):
        self.db = db
        self.cursos = CursoRepository(db)
        self.actividades = ActividadRepository(db)
        self.secciones = SeccionRepository(db)

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
        """
        Una actividad nueva no tiene rúbrica: su total de pesos es el valor por defecto (0).
        Con alcance específico, sus secciones deben ser del curso.
        """
        self._curso_del_docente(curso_id, docente_email)
        datos = dict(datos)
        secciones_ids = datos.pop("secciones_ids", None) or []
        secciones = self._secciones_del_curso(curso_id, secciones_ids)
        actividad = self.actividades.agregar(Actividad(**datos, curso_id=curso_id, secciones=secciones))
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
        """
        Aplica solo los campos de `cambios`: nombre, peso en la nota final y/o alcance.
        Ampliar el alcance siempre se puede; quitar una sección no, si ya tiene equipos o
        calificaciones de la actividad (quedarían fuera de la pantalla pero contando en
        los promedios).
        """
        actividad = self._actividad_del_docente(actividad_id, docente_email)
        cambios = dict(cambios)
        aplica_todas = cambios.pop("aplica_todas_secciones", None)
        secciones_ids = cambios.pop("secciones_ids", None)
        if aplica_todas is not None:
            self._cambiar_alcance(actividad, aplica_todas, secciones_ids or [])
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

    def _cambiar_alcance(self, actividad: Actividad, aplica_todas: bool, secciones_ids: List[int]) -> None:
        """
        Valida todo antes de cambiar nada. Cada sección que sale del alcance (con "todas"
        antes, cualquiera del curso que no quede) no puede tener equipos de la actividad ni
        calificaciones individuales de sus estudiantes: SeccionConTrabajoEnActividad (409).
        """
        nuevas: List[Seccion] = [] if aplica_todas else self._secciones_del_curso(actividad.curso_id, secciones_ids)
        if not aplica_todas:
            actuales = (
                self.secciones.de_curso(actividad.curso_id) if actividad.aplica_todas_secciones
                else actividad.secciones
            )
            quedan = {s.id for s in nuevas}
            equipos = EquipoRepository(self.db)
            calificaciones = CalificacionRepository(self.db)
            for seccion in actuales:
                if seccion.id in quedan:
                    continue
                if (equipos.de_actividad_y_seccion(actividad.id, seccion.id)
                        or calificaciones.existen_de_estudiantes_de_seccion(actividad.id, seccion.id)):
                    raise SeccionConTrabajoEnActividad(actividad.nombre, seccion.nombre)
        actividad.aplica_todas_secciones = aplica_todas
        actividad.secciones = nuevas

    def _secciones_del_curso(self, curso_id: int, secciones_ids: List[int]) -> List[Seccion]:
        """Las secciones pedidas, en su orden; SeccionesFueraDelCurso si alguna no es del curso."""
        if not secciones_ids:
            return []
        encontradas = {s.id: s for s in self.secciones.de_curso(curso_id, secciones_ids)}
        faltan = [sid for sid in secciones_ids if sid not in encontradas]
        if faltan:
            raise SeccionesFueraDelCurso(faltan)
        return [encontradas[sid] for sid in secciones_ids]

    @staticmethod
    def _con_total(actividad: Actividad, total_peso: Decimal) -> ActividadOut:
        return ActividadOut.model_validate(actividad).model_copy(update={"total_peso_criterios": total_peso})

    def _curso_del_docente(self, curso_id: int, email: str) -> Curso:
        return curso_del_docente(self.cursos, curso_id, email)

    def _actividad_del_docente(self, actividad_id: int, email: str) -> Actividad:
        return actividad_del_docente(self.actividades, self.cursos, actividad_id, email)
