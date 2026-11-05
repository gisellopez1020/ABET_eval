"""
Tipos de columna propios.

TextoCifrado cifra al guardar y descifra al leer (utils/cifrado.py), así el resto del
código sigue usando estudiante.nombre_completo como texto normal: servicios,
esquemas, reportes y exportaciones no cambian. También aplica a las consultas de
columnas sueltas (query(Estudiante.id, Estudiante.nombre_completo)).

Lo que NO se puede hacer con una columna cifrada: filtrar, buscar u ordenar en SQL
(WHERE codigo_estudiante = ..., LIKE, ORDER BY). Cada valor se cifra con un vector
aleatorio, así que el mismo nombre da textos cifrados distintos y la base no los
puede comparar. El orden por nombre se hace en Python (utils/orden.py).
"""
from typing import Optional

from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator

from app.utils.cifrado import cifrar_dato, descifrar_dato


class TextoCifrado(TypeDecorator):
    """
    Text en la base (el valor cifrado ocupa ~2,5 veces el original más ~100 caracteres);
    `longitud_maxima` conserva el límite del texto original que antes ponía VARCHAR(n).
    """

    impl = Text
    cache_ok = True

    def __init__(self, longitud_maxima: Optional[int] = None):
        super().__init__()
        self.longitud_maxima = longitud_maxima

    def process_bind_param(self, value: Optional[str], dialect) -> Optional[str]:
        if value is None:
            return None
        if self.longitud_maxima is not None and len(value) > self.longitud_maxima:
            # Mismo efecto que antes el VARCHAR(n) de la base: no se guarda.
            # El mensaje no incluye el valor (es un dato personal).
            raise ValueError(f"El texto supera los {self.longitud_maxima} caracteres permitidos")
        return cifrar_dato(value)

    def process_result_value(self, value: Optional[str], dialect) -> Optional[str]:
        if value is None:
            return None
        return descifrar_dato(value)
