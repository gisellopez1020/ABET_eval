"""
Reglas de negocio de las calificaciones: resumen por sección, lectura por equipo o
estudiante, guardado completo (actualizar o insertar por criterio), edición de una
calificación y calificación masiva por equipos. Lanza errores de app/services/errores.py
(nunca HTTPException) y es dueño de la transacción: hace commit al terminar cada operación.

Las validaciones van antes de escribir: un guardado inválido no deja nada escrito.
"""
from decimal import Decimal
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models import Calificacion
from app.repositories.actividad import ActividadRepository
from app.repositories.calificacion import CalificacionRepository
from app.repositories.curso import CursoRepository
from app.repositories.equipo import EquipoRepository
from app.repositories.estudiante import EstudianteRepository
from app.repositories.rubrica import RubricaRepository
from app.repositories.seccion import SeccionRepository
from app.schemas.calificacion import CalificacionOut, ResumenCalificacion, ValorCriterio
from app.services.acceso import actividad_del_docente, seccion_del_curso
from app.services.errores import (
    CalificacionNoEncontrada, CriterioFueraDeActividad, EquipoFueraDeActividad, EquipoNoPerteneceAActividad,
    EstudianteFueraDelCurso, EstudianteNoEncontrado, EstudianteNoPerteneceAlCurso, SinPermiso,
)
from app.utils.calculo import calcular_nota_parcial


class CalificacionService:
    def __init__(self, db: Session):
        self.db = db
        self.actividades = ActividadRepository(db)
        self.cursos = CursoRepository(db)
        self.secciones = SeccionRepository(db)
        self.equipos = EquipoRepository(db)
        self.estudiantes = EstudianteRepository(db)
        self.rubrica = RubricaRepository(db)
        self.calificaciones = CalificacionRepository(db)

    def resumen(self, actividad_id: int, seccion_id: int, docente_email: str) -> List[ResumenCalificacion]:
        """Estado de calificación de cada equipo (grupal) o estudiante (individual) de la sección."""
        actividad = actividad_del_docente(self.actividades, self.cursos, actividad_id, docente_email)
        seccion_del_curso(self.secciones, seccion_id, actividad.curso_id)

        total_criterios = self.rubrica.contar_criterios(actividad_id)
        resultado: List[ResumenCalificacion] = []

        if actividad.tipo.value == "grupal":
            for equipo in self.equipos.de_actividad_y_seccion(actividad_id, seccion_id):
                calificados_count = self.calificaciones.contar_de_equipo(equipo.id, actividad_id)
                calificado = total_criterios > 0 and calificados_count >= total_criterios
                nota = self._nota_total(equipo.id, True, actividad_id) if calificado else None
                resultado.append(ResumenCalificacion(
                    equipo_id=equipo.id,
                    nombre=equipo.nombre,
                    nota_total=nota,
                    calificado=calificado,
                    criterios_calificados=calificados_count,
                    criterios_totales=total_criterios,
                ))
        else:
            for est in self.estudiantes.de_seccion(seccion_id):
                calificados_count = self.calificaciones.contar_de_estudiante(est.id, actividad_id)
                calificado = total_criterios > 0 and calificados_count >= total_criterios
                nota = self._nota_total(est.id, False, actividad_id) if calificado else None
                resultado.append(ResumenCalificacion(
                    estudiante_id=est.id,
                    nombre=est.nombre_completo,
                    nota_total=nota,
                    calificado=calificado,
                    criterios_calificados=calificados_count,
                    criterios_totales=total_criterios,
                ))
        return resultado

    def de_equipo(self, actividad_id: int, equipo_id: int, docente_email: str) -> List[Calificacion]:
        """Las calificaciones guardadas del equipo, una por criterio calificado de la actividad."""
        actividad_del_docente(self.actividades, self.cursos, actividad_id, docente_email)
        equipo = self.equipos.get(equipo_id)
        if not equipo or equipo.actividad_id != actividad_id:
            raise EquipoFueraDeActividad()
        return self.calificaciones.de_equipo(equipo_id, actividad_id)

    def de_estudiante(self, actividad_id: int, estudiante_id: int, docente_email: str) -> List[Calificacion]:
        """Las calificaciones individuales del estudiante en la actividad (no las de sus equipos)."""
        actividad = actividad_del_docente(self.actividades, self.cursos, actividad_id, docente_email)
        estudiante = self.estudiantes.get(estudiante_id)
        seccion = self.secciones.get(estudiante.seccion_id) if estudiante else None
        if not seccion or seccion.curso_id != actividad.curso_id:
            raise EstudianteFueraDelCurso()
        return self.calificaciones.de_estudiante(estudiante_id, actividad_id)

    def guardar(
        self, docente_email: str, actividad_id: int, criterios: List[ValorCriterio],
        equipo_id: Optional[int], estudiante_id: Optional[int],
    ) -> List[CalificacionOut]:
        """
        Guarda la calificación de un equipo o estudiante (el schema garantiza que viene
        exactamente uno). Si un criterio ya tiene calificación, la reemplaza. Todo se
        valida antes de escribir: un criterio de otra actividad no deja guardados los demás.
        """
        actividad = actividad_del_docente(self.actividades, self.cursos, actividad_id, docente_email)

        if equipo_id:
            equipo = self.equipos.get(equipo_id)
            if not equipo or equipo.actividad_id != actividad_id:
                raise EquipoNoPerteneceAActividad()
        if estudiante_id:
            est = self.estudiantes.get(estudiante_id)
            if not est:
                raise EstudianteNoEncontrado()
            seccion = self.secciones.get(est.seccion_id)
            if not seccion or seccion.curso_id != actividad.curso_id:
                raise EstudianteNoPerteneceAlCurso()

        criterios_map = {c.id: c for c in self.rubrica.criterios_de_actividad(actividad_id)}
        # Validar todos los criterios antes de escribir ninguno (el primero inválido, en orden)
        for vc in criterios:
            if vc.criterio_id not in criterios_map:
                raise CriterioFueraDeActividad(vc.criterio_id)

        guardadas: List[CalificacionOut] = []
        for vc in criterios:
            criterio = criterios_map[vc.criterio_id]
            nota_parcial = calcular_nota_parcial(vc.valor, criterio.peso_porcentaje)

            # Buscar calificación previa para este criterio + entidad
            if equipo_id:
                existente = self.calificaciones.de_criterio_y_equipo(vc.criterio_id, equipo_id)
            else:
                existente = self.calificaciones.de_criterio_y_estudiante(vc.criterio_id, estudiante_id)

            if existente:
                self.calificaciones.actualizar(existente, vc.valor, nota_parcial)
                guardadas.append(CalificacionOut.model_validate(existente))
            else:
                nueva = self.calificaciones.agregar(Calificacion(
                    criterio_id=vc.criterio_id,
                    valor=vc.valor,
                    equipo_id=equipo_id,
                    estudiante_id=estudiante_id,
                    nota_calculada=nota_parcial,
                ))
                guardadas.append(CalificacionOut.model_validate(nueva))

        self.db.commit()
        return guardadas

    def editar(self, calificacion_id: int, docente_email: str, valor: int) -> Calificacion:
        """Cambia el valor binario de una calificación y recalcula su puntaje parcial."""
        calificacion, criterio = self._calificacion_del_docente(calificacion_id, docente_email)
        calificacion.valor = valor
        calificacion.nota_calculada = calcular_nota_parcial(valor, criterio.peso_porcentaje)
        self.db.commit()
        self.db.refresh(calificacion)
        return calificacion

    def masivo(
        self, actividad_id: int, seccion_id: int, docente_email: str, criterios: List[ValorCriterio],
    ) -> List[CalificacionOut]:
        """
        Aplica los mismos valores a todos los equipos de la sección que todavía no tienen
        calificación. Los ya calificados no se modifican; uno calificado en parte conserva
        lo que tiene y solo recibe los criterios que le faltan. Los criterios que no son
        de la actividad se ignoran.
        """
        actividad = actividad_del_docente(self.actividades, self.cursos, actividad_id, docente_email)
        seccion_del_curso(self.secciones, seccion_id, actividad.curso_id)

        equipos = self.equipos.de_actividad_y_seccion(actividad_id, seccion_id)
        criterios_map = {c.id: c for c in self.rubrica.criterios_de_actividad(actividad_id)}
        total_criterios = len(criterios_map)
        todas_guardadas: List[CalificacionOut] = []

        for equipo in equipos:
            # Criterios que el equipo ya tiene calificados: no se sobrescriben
            ya_calificados = {
                c.criterio_id
                for c in self.calificaciones.de_equipo(equipo.id, actividad_id)
            }
            if len(ya_calificados) >= total_criterios:
                continue

            for vc in criterios:
                criterio = criterios_map.get(vc.criterio_id)
                if not criterio or vc.criterio_id in ya_calificados:
                    continue
                ya_calificados.add(vc.criterio_id)  # un criterio repetido en el body se inserta una vez
                nota_parcial = calcular_nota_parcial(vc.valor, criterio.peso_porcentaje)
                nueva = self.calificaciones.agregar(Calificacion(
                    criterio_id=vc.criterio_id,
                    valor=vc.valor,
                    equipo_id=equipo.id,
                    nota_calculada=nota_parcial,
                ))
                todas_guardadas.append(CalificacionOut.model_validate(nueva))

        self.db.commit()
        return todas_guardadas

    def _calificacion_del_docente(self, calificacion_id: int, email: str):
        """
        (calificación, su criterio). El 403 nombra a la calificación (el recurso de la URL),
        no a la actividad: por eso no usa actividad_del_docente. Las FK NOT NULL garantizan
        cada eslabón de la cadena calificación -> criterio -> aspecto -> actividad.
        """
        calificacion = self.calificaciones.get(calificacion_id)
        if not calificacion:
            raise CalificacionNoEncontrada()
        criterio = self.rubrica.get_criterio(calificacion.criterio_id)
        aspecto = self.rubrica.get_aspecto(criterio.aspecto_id)
        actividad = self.actividades.get(aspecto.actividad_id)
        curso = self.cursos.get(actividad.curso_id)
        if not curso or curso.docente_email != email:
            raise SinPermiso("No tiene permiso sobre esta calificación")
        return calificacion, criterio

    def _nota_total(self, entity_id: int, es_equipo: bool, actividad_id: int) -> Decimal:
        if es_equipo:
            result = self.calificaciones.suma_notas_de_equipo(entity_id, actividad_id)
        else:
            result = self.calificaciones.suma_notas_de_estudiante(entity_id, actividad_id)
        return result or Decimal("0")
