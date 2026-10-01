"""
Reglas de negocio de los equipos de trabajo de una actividad grupal y del modo de
calificación (por equipos o por estudiantes). Lanza errores de app/services/errores.py
(nunca HTTPException) y es dueño de la transacción: hace commit al terminar cada operación.

Reglas de composición: cada integrante es de la sección del equipo, no se repite dentro
de un equipo y está en un solo equipo por actividad (en otras actividades, sí).
"""
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models import Actividad, EquipoTrabajo, Seccion
from app.models.actividad import TipoActividad
from app.repositories.actividad import ActividadRepository
from app.repositories.calificacion import CalificacionRepository
from app.repositories.curso import CursoRepository
from app.repositories.equipo import EquipoRepository
from app.repositories.estudiante import EstudianteRepository
from app.repositories.rubrica import RubricaRepository
from app.repositories.seccion import SeccionRepository
from app.schemas.equipo import EquipoCreate, EquipoOut, ModoCalificacionItem, ModoCalificacionResponse
from app.schemas.estudiante import EstudianteOut
from app.services.acceso import actividad_del_docente, seccion_del_curso
from app.services.errores import (
    ActividadNoGrupal, EquipoNoEncontrado, EstudianteEnDosEquipos, EstudianteFueraDeSeccion,
    EstudianteRepetidoEnEquipo, EstudianteYaEnOtroEquipo, SinPermiso,
)


class EquipoService:
    def __init__(self, db: Session):
        self.db = db
        self.actividades = ActividadRepository(db)
        self.cursos = CursoRepository(db)
        self.secciones = SeccionRepository(db)
        self.equipos = EquipoRepository(db)
        self.estudiantes = EstudianteRepository(db)

    def listar(self, actividad_id: int, seccion_id: int, docente_email: str) -> List[EquipoOut]:
        """Equipos de la actividad en la sección, con su estado de calificación."""
        self._actividad_y_seccion(actividad_id, seccion_id, docente_email)
        return [self._equipo_out(e, actividad_id) for e in self.equipos.de_actividad_y_seccion(actividad_id, seccion_id)]

    def crear(
        self, actividad_id: int, seccion_id: int, docente_email: str, equipos: List[EquipoCreate],
    ) -> List[EquipoOut]:
        """
        Crea uno o varios equipos en la sección. Valida todos los integrantes antes de
        crear nada: que sean de la sección, que no se repitan dentro de un equipo ni
        entre dos equipos del envío, y que no estén ya en otro equipo de la actividad.
        """
        actividad, _ = self._actividad_y_seccion(actividad_id, seccion_id, docente_email)
        if actividad.tipo != TipoActividad.grupal:
            raise ActividadNoGrupal()

        equipo_de: dict[int, int] = {}  # estudiante_id -> índice del equipo del envío
        for idx, eq_in in enumerate(equipos):
            vistos: set[int] = set()
            for est_id in eq_in.estudiante_ids:
                estudiante = self.estudiantes.get(est_id)
                if not estudiante or estudiante.seccion_id != seccion_id:
                    raise EstudianteFueraDeSeccion(est_id, seccion_id)
                # Repetido dentro del mismo equipo: setdefault no lo detecta (mismo índice)
                if est_id in vistos:
                    raise EstudianteRepetidoEnEquipo(estudiante.nombre_completo, eq_in.nombre)
                vistos.add(est_id)
                previo = equipo_de.setdefault(est_id, idx)
                if previo != idx:
                    raise EstudianteEnDosEquipos(estudiante.nombre_completo, equipos[previo].nombre, eq_in.nombre)
        self._validar_sin_otro_equipo(list(equipo_de), actividad_id)

        nuevos: List[EquipoTrabajo] = []
        for eq_in in equipos:
            equipo = self.equipos.agregar(EquipoTrabajo(
                nombre=eq_in.nombre, actividad_id=actividad_id, seccion_id=seccion_id,
            ))
            for est_id in eq_in.estudiante_ids:
                self.equipos.agregar_miembro(equipo.id, est_id)
            nuevos.append(equipo)

        self.db.commit()
        for e in nuevos:
            self.db.refresh(e)
        return [self._equipo_out(e, actividad_id) for e in nuevos]

    def editar(
        self, equipo_id: int, docente_email: str, nombre: Optional[str], estudiante_ids: Optional[List[int]],
    ) -> EquipoOut:
        """
        Cambia el nombre (si viene no vacío) y/o los integrantes (si vienen, aunque sea
        una lista vacía). El nombre se asigna antes de validar los integrantes, así que
        un error de integrantes ya nombra al equipo por su nombre nuevo.
        """
        equipo = self._equipo_del_docente(equipo_id, docente_email)

        if nombre:
            equipo.nombre = nombre

        if estudiante_ids is not None:
            vistos: set[int] = set()
            for est_id in estudiante_ids:
                estudiante = self.estudiantes.get(est_id)
                if not estudiante or estudiante.seccion_id != equipo.seccion_id:
                    raise EstudianteFueraDeSeccion(est_id)
                if est_id in vistos:
                    raise EstudianteRepetidoEnEquipo(estudiante.nombre_completo, equipo.nombre)
                vistos.add(est_id)
            # El propio equipo no cuenta: guardar sin cambios no choca consigo mismo
            self._validar_sin_otro_equipo(estudiante_ids, equipo.actividad_id, excluir_equipo_id=equipo_id)

            self.equipos.eliminar_miembros(equipo)
            for est_id in estudiante_ids:
                self.equipos.agregar_miembro(equipo_id, est_id)

        self.db.commit()
        self.db.refresh(equipo)
        return self._equipo_out(equipo, equipo.actividad_id)

    def modo_calificacion(self, actividad_id: int, seccion_id: int, docente_email: str) -> ModoCalificacionResponse:
        """
        Si la actividad se califica por equipos (grupal) o por estudiantes (individual),
        con cada equipo o estudiante de la sección, su estado y cuántos están calificados.
        """
        actividad, _ = self._actividad_y_seccion(actividad_id, seccion_id, docente_email)
        total_criterios = RubricaRepository(self.db).contar_criterios(actividad_id)
        calificaciones = CalificacionRepository(self.db)

        if actividad.tipo == TipoActividad.grupal:
            items: List[ModoCalificacionItem] = []
            calificados = 0
            for e in self.equipos.de_actividad_y_seccion(actividad_id, seccion_id):
                calif_count = calificaciones.contar_de_equipo(e.id, actividad_id)
                es_calificado = total_criterios > 0 and calif_count >= total_criterios
                nota = calificaciones.suma_notas_de_equipo(e.id, actividad_id) if es_calificado else None
                if es_calificado:
                    calificados += 1
                items.append(ModoCalificacionItem(
                    id=e.id,
                    nombre=e.nombre,
                    miembros=[EstudianteOut.model_validate(m.estudiante) for m in e.miembros],
                    calificado=es_calificado,
                    nota_total=nota,
                ))
            return ModoCalificacionResponse(tipo="grupal", items=items, total=len(items), calificados=calificados)

        items = []
        calificados = 0
        for est in self.estudiantes.de_seccion(seccion_id):
            calif_count = calificaciones.contar_de_estudiante(est.id, actividad_id)
            es_calificado = total_criterios > 0 and calif_count >= total_criterios
            nota = calificaciones.suma_notas_de_estudiante(est.id, actividad_id) if es_calificado else None
            if es_calificado:
                calificados += 1
            items.append(ModoCalificacionItem(
                id=est.id,
                nombre=est.nombre_completo,
                miembros=[EstudianteOut.model_validate(est)],
                calificado=es_calificado,
                nota_total=nota,
            ))
        return ModoCalificacionResponse(tipo="individual", items=items, total=len(items), calificados=calificados)

    def _actividad_y_seccion(self, actividad_id: int, seccion_id: int, email: str) -> Tuple[Actividad, Seccion]:
        actividad = actividad_del_docente(self.actividades, self.cursos, actividad_id, email)
        return actividad, seccion_del_curso(self.secciones, seccion_id, actividad.curso_id)

    def _equipo_del_docente(self, equipo_id: int, email: str) -> EquipoTrabajo:
        """
        El 403 nombra al equipo (el recurso de la URL), no a la actividad: por eso no usa
        actividad_del_docente. La FK NOT NULL garantiza que la actividad del equipo existe.
        """
        equipo = self.equipos.get(equipo_id)
        if not equipo:
            raise EquipoNoEncontrado()
        actividad = self.actividades.get(equipo.actividad_id)
        curso = self.cursos.get(actividad.curso_id)
        if not curso or curso.docente_email != email:
            raise SinPermiso("No tiene permiso sobre este equipo")
        return equipo

    def _validar_sin_otro_equipo(
        self, estudiante_ids: List[int], actividad_id: int, excluir_equipo_id: Optional[int] = None,
    ) -> None:
        """Un estudiante solo puede estar en un equipo por actividad (en otras actividades, sí)."""
        if not estudiante_ids:
            return
        choque = self.equipos.choque_de_membresia(estudiante_ids, actividad_id, excluir_equipo_id)
        if choque:
            raise EstudianteYaEnOtroEquipo(choque[0], choque[1])

    def _equipo_out(self, equipo: EquipoTrabajo, actividad_id: int) -> EquipoOut:
        """El equipo con sus integrantes y su estado: calificado si tiene todos los criterios."""
        calificaciones = CalificacionRepository(self.db)
        total_criterios = RubricaRepository(self.db).contar_criterios(actividad_id)
        calificados = calificaciones.contar_de_equipo(equipo.id, actividad_id)
        calificado = total_criterios > 0 and calificados >= total_criterios
        nota = calificaciones.suma_notas_de_equipo(equipo.id, actividad_id) if calificado else None
        return EquipoOut(
            id=equipo.id,
            nombre=equipo.nombre,
            actividad_id=equipo.actividad_id,
            seccion_id=equipo.seccion_id,
            miembros=[EstudianteOut.model_validate(m.estudiante) for m in equipo.miembros],
            calificado=calificado,
            nota_total=nota,
        )
