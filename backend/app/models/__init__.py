from .base import Base
from .curso import Curso
from .seccion import Seccion
from .estudiante import Estudiante
from .actividad import Actividad, TipoActividad
from .aspecto import Aspecto
from .criterio import Criterio
from .equipo import EquipoTrabajo, MiembroEquipo
from .calificacion import Calificacion

__all__ = [
    "Base",
    "Curso",
    "Seccion",
    "Estudiante",
    "Actividad",
    "TipoActividad",
    "Aspecto",
    "Criterio",
    "EquipoTrabajo",
    "MiembroEquipo",
    "Calificacion",
]
