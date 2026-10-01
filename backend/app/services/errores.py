"""
Errores de negocio que lanzan los servicios. No dependen de FastAPI: la capa HTTP
(app/errores_http.py) traduce cada categoría a su código de estado, y str(exc) es
el mensaje que recibe el usuario.

Las excepciones concretas heredan de una categoría (NoEncontrado, SinPermiso,
Conflicto); una nueva excepción de una categoría existente no requiere tocar la capa HTTP.
"""


class ErrorDeNegocio(Exception):
    """Base de los errores de negocio. No se lanza directamente: se usa una categoría."""


# ── Categorías ───────────────────────────────────────────────────────────────

class NoEncontrado(ErrorDeNegocio):
    """El recurso pedido no existe."""


class SinPermiso(ErrorDeNegocio):
    """El recurso existe pero no pertenece al docente."""


class Conflicto(ErrorDeNegocio):
    """La operación choca con el estado actual de los datos."""


class DatosInvalidos(ErrorDeNegocio):
    """Los datos enviados no cumplen una regla que requiere consultar la BD."""


class SolicitudInvalida(ErrorDeNegocio):
    """
    Igual que DatosInvalidos (la petición no cumple una regla de negocio), pero para los
    endpoints que históricamente responden 400 en vez de 422 (equipos, calificaciones).
    Se mantiene aparte para no cambiar esos códigos; unificarlos es un cambio de API.
    """


# ── Excepciones concretas ────────────────────────────────────────────────────

class CursoNoEncontrado(NoEncontrado):
    def __init__(self):
        super().__init__("Curso no encontrado")


class SeccionNoEncontrada(NoEncontrado):
    def __init__(self):
        super().__init__("Sección no encontrada")


class EstudianteNoEncontrado(NoEncontrado):
    def __init__(self):
        super().__init__("Estudiante no encontrado")


class AsignaturaNoEncontrada(NoEncontrado):
    """El curso pedido como filtro de la exportación no existe (en esa pantalla se llama asignatura)."""

    def __init__(self):
        super().__init__("Asignatura no encontrada")


class SeccionFueraDeAsignatura(NoEncontrado):
    def __init__(self):
        super().__init__("Sección no encontrada en esta asignatura")


class ArchivoInvalido(DatosInvalidos):
    """El archivo subido no se puede leer o le faltan columnas obligatorias (el mensaje dice cuál)."""


class ActividadNoEncontrada(NoEncontrado):
    def __init__(self):
        super().__init__("Actividad no encontrada")


class ActividadConCalificaciones(Conflicto):
    """Eliminar la actividad borraría en cascada calificaciones ya registradas."""

    def __init__(self, nombre: str):
        self.nombre = nombre
        super().__init__(f"No se puede eliminar '{nombre}' porque ya tiene calificaciones registradas.")


class RaAbetDesconocidos(DatosInvalidos):
    def __init__(self, codigos: list[str]):
        self.codigos = codigos
        super().__init__(f"Códigos RA ABET que no existen en el catálogo: {', '.join(codigos)}")


class CursoConCriteriosAbet(DatosInvalidos):
    """Un curso solo selecciona Resultados de Aprendizaje, no Criterios individuales."""

    def __init__(self, codigos: list[str]):
        self.codigos = codigos
        super().__init__(
            "Un curso solo puede tener Resultados de Aprendizaje, no Criterios: "
            f"{', '.join(codigos)}"
        )


class SeccionConEstudiantes(Conflicto):
    def __init__(self, nombre: str, cantidad: int):
        self.nombre = nombre
        self.cantidad = cantidad
        super().__init__(
            f"No se puede eliminar la sección '{nombre}' porque tiene "
            f"{cantidad} estudiante(s) registrado(s). "
            "Elimine los estudiantes primero."
        )


# ── Catálogo RA ABET ─────────────────────────────────────────────────────────

class CodigoNoEncontrado(NoEncontrado):
    def __init__(self, codigo: str):
        self.codigo = codigo
        super().__init__(f"El código '{codigo}' no existe en el catálogo")


class CodigoDuplicado(Conflicto):
    def __init__(self, codigo: str):
        self.codigo = codigo
        super().__init__(f"El código '{codigo}' ya existe en el catálogo")


class PadreInexistente(DatosInvalidos):
    def __init__(self, codigo_padre: str):
        self.codigo_padre = codigo_padre
        super().__init__(f"El RA padre '{codigo_padre}' no existe en el catálogo")


class PadreEsCriterio(DatosInvalidos):
    """El catálogo tiene solo dos niveles: un Criterio no puede tener Criterios hijos."""

    def __init__(self, codigo_padre: str):
        self.codigo_padre = codigo_padre
        super().__init__(
            f"'{codigo_padre}' es un Criterio y no puede tener Criterios hijos (solo se permiten 2 niveles)"
        )


class CambioDeNivel(DatosInvalidos):
    def __init__(self, codigo: str):
        self.codigo = codigo
        super().__init__(
            f"'{codigo}' no puede cambiar de nivel (Resultado de Aprendizaje <-> Criterio); "
            "elimínelo y créelo de nuevo"
        )


class ImportacionInvalida(DatosInvalidos):
    """El estado final de la importación sería inválido; `errores` trae cada motivo."""

    def __init__(self, errores: list[str]):
        self.errores = errores
        super().__init__("No se importó nada: " + "; ".join(errores))


class CodigoNoEliminable(Conflicto):
    """Base de los motivos por los que un código del catálogo no se puede eliminar."""

    def __init__(self, codigo: str, cantidad: int, motivo: str):
        self.codigo = codigo
        self.cantidad = cantidad
        super().__init__(f"No se puede eliminar '{codigo}' porque {motivo}")


class CodigoConCriterios(CodigoNoEliminable):
    def __init__(self, codigo: str, cantidad: int):
        super().__init__(
            codigo, cantidad, f"tiene {cantidad} criterio{'s' if cantidad != 1 else ''}; elimínelos primero."
        )


class CodigoEnUsoPorCursos(CodigoNoEliminable):
    def __init__(self, codigo: str, cantidad: int):
        super().__init__(codigo, cantidad, f"está en uso por {cantidad} curso{'s' if cantidad != 1 else ''}.")


class CodigoVinculadoAAspectos(CodigoNoEliminable):
    """Desvincular en silencio haría desaparecer sus calificaciones del reporte ABET."""

    def __init__(self, codigo: str, cantidad: int):
        super().__init__(
            codigo, cantidad,
            f"está vinculado a {cantidad} aspecto{'s' if cantidad != 1 else ''} de rúbrica.",
        )


# ── Rúbrica de una actividad (aspectos y criterios) ──────────────────────────

class AspectoNoEncontrado(NoEncontrado):
    def __init__(self):
        super().__init__("Aspecto no encontrado en esta actividad")


class RubricaConCalificaciones(Conflicto):
    """Reemplazar la rúbrica borraría en cascada calificaciones ya registradas."""

    def __init__(self, nombre: str):
        self.nombre = nombre
        super().__init__(
            f"No se puede modificar la rúbrica de '{nombre}' porque ya tiene calificaciones registradas."
        )


class PesosRubricaInvalidos(DatosInvalidos):
    def __init__(self, total):
        self.total = total
        super().__init__(f"Los criterios suman {total}%. Deben sumar exactamente 100%.")


class CodigoAbetDesconocido(DatosInvalidos):
    def __init__(self, codigo: str):
        self.codigo = codigo
        super().__init__(f"El código ABET '{codigo}' no existe en el catálogo de Student Outcomes")


class CodigoAbetEsResultado(DatosInvalidos):
    """Un aspecto se vincula a un Criterio del catálogo, no a un Resultado de Aprendizaje."""

    def __init__(self, codigo: str):
        self.codigo = codigo
        super().__init__(
            f"'{codigo}' es un Resultado de Aprendizaje, no un Criterio — usa un código como {codigo}.1"
        )


class LimiteRaAbetCurso(DatosInvalidos):
    """Vincular el código agregaría al curso más RA de los permitidos (MAX_RA_ABET)."""

    def __init__(self, faltantes: list[str], curso_nombre: str, actuales: int, maximo: int):
        self.faltantes = faltantes
        self.actuales = actuales
        self.maximo = maximo
        super().__init__(
            f"Vincular este código agregaría {', '.join(faltantes)} a la asignatura "
            f"'{curso_nombre}', que ya tiene {actuales} de {maximo} RA ABET. "
            "Quita alguno en Editar asignatura."
        )


class RubricaExcelInvalida(DatosInvalidos):
    """El Excel de la rúbrica no tiene el formato esperado (el mensaje es el del parser)."""


# ── Equipos de trabajo ───────────────────────────────────────────────────────

class SeccionFueraDelCurso(NoEncontrado):
    """La sección no existe o es de otro curso que el de la actividad."""

    def __init__(self):
        super().__init__("Sección no encontrada en este curso")


class EquipoNoEncontrado(NoEncontrado):
    def __init__(self):
        super().__init__("Equipo no encontrado")


class ActividadNoGrupal(SolicitudInvalida):
    def __init__(self):
        super().__init__("Solo se pueden crear equipos para actividades de tipo grupal")


class EstudianteFueraDeSeccion(SolicitudInvalida):
    """
    El estudiante no existe o no es de la sección. Al crear se nombra la sección por su
    id; al editar, como "la sección del equipo".
    """

    def __init__(self, estudiante_id: int, seccion_id: int | None = None):
        self.estudiante_id = estudiante_id
        self.seccion_id = seccion_id
        seccion = f"la sección {seccion_id}" if seccion_id is not None else "la sección del equipo"
        super().__init__(f"Estudiante {estudiante_id} no pertenece a {seccion}")


class EstudianteRepetidoEnEquipo(SolicitudInvalida):
    def __init__(self, estudiante: str, equipo: str):
        self.estudiante = estudiante
        self.equipo = equipo
        super().__init__(f"El estudiante {estudiante} está repetido en el equipo '{equipo}'")


class EstudianteEnDosEquipos(SolicitudInvalida):
    """El mismo estudiante aparece en dos equipos de un mismo envío."""

    def __init__(self, estudiante: str, equipo_a: str, equipo_b: str):
        self.estudiante = estudiante
        self.equipos = (equipo_a, equipo_b)
        super().__init__(f"El estudiante {estudiante} está en dos equipos: '{equipo_a}' y '{equipo_b}'")


class EstudianteYaEnOtroEquipo(SolicitudInvalida):
    """Un estudiante solo puede estar en un equipo por actividad (en otras actividades, sí)."""

    def __init__(self, estudiante: str, equipo: str):
        self.estudiante = estudiante
        self.equipo = equipo
        super().__init__(f"El estudiante {estudiante} ya está en el equipo '{equipo}' de esta actividad")


# ── Calificaciones ───────────────────────────────────────────────────────────
# El equipo y el estudiante tienen dos excepciones por regla: si el id viene en la URL
# (lecturas) el recurso pedido "no existe aquí" (404); si viene en el body (guardar),
# la petición es inválida (400).

class EquipoFueraDeActividad(NoEncontrado):
    def __init__(self):
        super().__init__("Equipo no encontrado en esta actividad")


class EstudianteFueraDelCurso(NoEncontrado):
    """El estudiante de la URL no existe o no es del curso de la actividad."""

    def __init__(self):
        super().__init__("Estudiante no encontrado en este curso")


class EquipoNoPerteneceAActividad(SolicitudInvalida):
    def __init__(self):
        super().__init__("El equipo no pertenece a esta actividad")


class EstudianteNoPerteneceAlCurso(SolicitudInvalida):
    def __init__(self):
        super().__init__("El estudiante no pertenece a este curso")


class CriterioFueraDeActividad(SolicitudInvalida):
    def __init__(self, criterio_id: int):
        self.criterio_id = criterio_id
        super().__init__(f"Criterio {criterio_id} no pertenece a esta actividad")


class CalificacionNoEncontrada(NoEncontrado):
    def __init__(self):
        super().__init__("Calificación no encontrada")


# ── Reportes ─────────────────────────────────────────────────────────────────

class ActividadFueraDelCurso(NoEncontrado):
    """La actividad de la URL no existe o es de otro curso que el de la URL."""

    def __init__(self):
        super().__init__("Actividad no encontrada en este curso")
