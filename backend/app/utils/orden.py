"""
Orden alfabético en español de los nombres de estudiantes, en Python.

Los nombres están cifrados en la base (RNF-14), así que ya no se pueden ordenar con
ORDER BY. Además, el PostgreSQL de la app (imagen alpine) ordenaba por código de
carácter: ÁLVAREZ y ÑUÑEZ quedaban después de ZAPATA. Aquí:

- Mayúsculas y minúsculas valen igual.
- Las vocales con tilde o diéresis cuentan como sin ella (Á = A, Ü = U).
- La Ñ es una letra aparte, entre la N y la O (NUNEZ < NUÑEZ < NUO).
- Los espacios cuentan (DE LA CRUZ antes que DELGADO), como antes.
- Desempate: el nombre tal cual (sin tilde antes que con tilde) y luego el id,
  para que el orden sea siempre el mismo.
"""
import unicodedata
from typing import Iterable, List, Tuple, TypeVar

T = TypeVar("T")

# Después de cualquier letra: "n" seguida de este carácter queda entre "nz..." y "o"
_TRAS_LA_N = "\U0010ffff"


def clave_nombre(nombre: str) -> str:
    """Clave de comparación en español de un nombre (ver el docstring del módulo)."""
    letras = []
    for caracter in unicodedata.normalize("NFD", nombre.casefold()):
        if unicodedata.category(caracter) == "Mn":
            # Marca combinante: la tilde de la ñ convierte la n previa en ñ; las demás
            # (tildes, diéresis) se ignoran
            if caracter == "̃" and letras and letras[-1] == "n":
                letras.append(_TRAS_LA_N)
            continue
        letras.append(caracter)
    return "".join(letras)


def clave_estudiante(estudiante) -> Tuple[str, str, int]:
    return (clave_nombre(estudiante.nombre_completo), estudiante.nombre_completo, estudiante.id)


def ordenar_por_nombre(estudiantes: Iterable[T]) -> List[T]:
    """Estudiantes (con .nombre_completo e .id) en orden alfabético español."""
    return sorted(estudiantes, key=clave_estudiante)
