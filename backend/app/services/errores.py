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
