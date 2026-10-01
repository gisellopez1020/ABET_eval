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
