from typing import Dict, Iterable, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models import Actividad, Estudiante, EquipoTrabajo, MiembroEquipo


class EquipoRepository:
    """Equipos de trabajo y sus integrantes (MiembroEquipo)."""

    def __init__(self, db: Session):
        self.db = db

    def get(self, equipo_id: int) -> Optional[EquipoTrabajo]:
        return self.db.get(EquipoTrabajo, equipo_id)

    def de_actividad_y_seccion(self, actividad_id: int, seccion_id: int) -> List[EquipoTrabajo]:
        return (
            self.db.query(EquipoTrabajo)
            .filter(
                EquipoTrabajo.actividad_id == actividad_id,
                EquipoTrabajo.seccion_id == seccion_id,
            )
            .all()
        )

    def de_actividad_ordenados(self, actividad_id: int, seccion_id: Optional[int] = None) -> List[EquipoTrabajo]:
        """Equipos de la actividad (o solo de la sección) ordenados por nombre."""
        query = self.db.query(EquipoTrabajo).filter(EquipoTrabajo.actividad_id == actividad_id)
        if seccion_id:
            query = query.filter(EquipoTrabajo.seccion_id == seccion_id)
        return query.order_by(EquipoTrabajo.nombre).all()

    def membresias_de_curso(self, curso_id: int) -> List[Tuple[int, int]]:
        """(estudiante_id, equipo_id) de todos los equipos de las actividades del curso."""
        return (
            self.db.query(MiembroEquipo.estudiante_id, MiembroEquipo.equipo_id)
            .join(EquipoTrabajo, MiembroEquipo.equipo_id == EquipoTrabajo.id)
            .join(Actividad, EquipoTrabajo.actividad_id == Actividad.id)
            .filter(Actividad.curso_id == curso_id)
            .all()
        )

    def choque_de_membresia(
        self, estudiante_ids: List[int], actividad_id: int, excluir_equipo_id: Optional[int] = None,
    ) -> Optional[Tuple[str, str]]:
        """
        (nombre del estudiante, nombre del equipo) del primero de los estudiantes que ya
        está en un equipo de la actividad, sin contar excluir_equipo_id. None si ninguno.
        """
        query = (
            self.db.query(Estudiante.nombre_completo, EquipoTrabajo.nombre)
            .join(MiembroEquipo, MiembroEquipo.estudiante_id == Estudiante.id)
            .join(EquipoTrabajo, MiembroEquipo.equipo_id == EquipoTrabajo.id)
            .filter(
                EquipoTrabajo.actividad_id == actividad_id,
                MiembroEquipo.estudiante_id.in_(estudiante_ids),
            )
        )
        if excluir_equipo_id is not None:
            query = query.filter(EquipoTrabajo.id != excluir_equipo_id)
        return query.first()

    def nombres_por_id(self, ids: Iterable[int]) -> Dict[int, str]:
        return dict(
            self.db.query(EquipoTrabajo.id, EquipoTrabajo.nombre)
            .filter(EquipoTrabajo.id.in_(list(ids)))
            .all()
        )

    def agregar(self, equipo: EquipoTrabajo) -> EquipoTrabajo:
        self.db.add(equipo)
        self.db.flush()
        return equipo

    def agregar_miembro(self, equipo_id: int, estudiante_id: int) -> MiembroEquipo:
        miembro = MiembroEquipo(equipo_id=equipo_id, estudiante_id=estudiante_id)
        self.db.add(miembro)
        return miembro

    def eliminar(self, equipo: EquipoTrabajo) -> None:
        """Elimina el equipo y, en cascada, sus membresías (no a los estudiantes)."""
        self.db.delete(equipo)

    def eliminar_miembros(self, equipo: EquipoTrabajo) -> None:
        """Quita a todos los integrantes del equipo y hace flush."""
        for miembro in equipo.miembros:
            self.db.delete(miembro)
        self.db.flush()
