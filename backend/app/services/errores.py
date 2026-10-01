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


# ── Excepciones concretas ────────────────────────────────────────────────────

class CursoNoEncontrado(NoEncontrado):
    def __init__(self):
        super().__init__("Curso no encontrado")


class SeccionNoEncontrada(NoEncontrado):
    def __init__(self):
        super().__init__("Sección no encontrada")


class SeccionConEstudiantes(Conflicto):
    def __init__(self, nombre: str, cantidad: int):
        self.nombre = nombre
        self.cantidad = cantidad
        super().__init__(
            f"No se puede eliminar la sección '{nombre}' porque tiene "
            f"{cantidad} estudiante(s) registrado(s). "
            "Elimine los estudiantes primero."
        )
