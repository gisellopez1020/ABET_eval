"""
Reglas de acceso compartidas por varios servicios: comprobar que un recurso existe y
pertenece al docente. Son funciones que solo leen, sin commit, para que un servicio
no tenga que depender de otro (cuyos métodos públicos sí hacen commit) solo por esto.

Reciben los repositorios del servicio que las llama: así ese servicio sigue siendo
el único dueño de sus repositorios y sus tests pueden sustituirlos.
"""
from app.models import Actividad
from app.repositories.actividad import ActividadRepository
from app.repositories.curso import CursoRepository
from app.services.errores import ActividadNoEncontrada, SinPermiso


def actividad_del_docente(
    actividades: ActividadRepository, cursos: CursoRepository, actividad_id: int, email: str,
) -> Actividad:
    """
    La actividad, si existe y su curso es del docente. ActividadNoEncontrada (404) si no
    existe; SinPermiso (403) si el curso es de otro docente o tampoco existe.
    """
    actividad = actividades.get(actividad_id)
    if not actividad:
        raise ActividadNoEncontrada()
    curso = cursos.get(actividad.curso_id)
    if not curso or curso.docente_email != email:
        raise SinPermiso("No tiene permiso sobre esta actividad")
    return actividad
