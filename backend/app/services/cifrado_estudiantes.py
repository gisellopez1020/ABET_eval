"""
Cifrado en bloque de los datos personales ya guardados en la tabla estudiantes
(RNF-14). Lo usan la migración 0012 (cifrar lo existente / descifrar al revertir) y
app/verificar_cifrado.py (al arrancar: comprobar la clave y cifrar lo pendiente).

Trabaja con SQL directo sobre una conexión, sin el modelo del ORM: así descifrar no
depende de TextoCifrado y la migración ve los valores tal como están en la base.
Idempotente: solo cifra lo que no tiene el prefijo enc:v1: y solo descifra lo que lo
tiene. Nunca registra en logs los datos ni la clave: solo cantidades.
"""
from dataclasses import dataclass
from typing import Dict, List

from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.utils.cifrado import (
    MENSAJE_SIN_CLAVE, PREFIJO_V1, DatosIlegibles, cifrar_dato, clave_datos_configurada,
    descifrar_dato, esta_cifrado,
)

# Columna -> longitud máxima del texto original (la del VARCHAR anterior a la 0012)
COLUMNAS: Dict[str, int] = {"nombre_completo": 200, "codigo_estudiante": 50, "email": 254}
_LISTA = ", ".join(COLUMNAS)


@dataclass
class Estado:
    estudiantes: int
    valores_cifrados: int
    valores_en_claro: int


def estado(conexion: Connection) -> Estado:
    """Cuántos valores (no nulos) de las tres columnas están cifrados y cuántos en claro."""
    filtros = " + ".join(
        f"(CASE WHEN {c} IS NOT NULL AND {c} {{op}} :prefijo THEN 1 ELSE 0 END)" for c in COLUMNAS
    )
    fila = conexion.execute(
        text(
            "SELECT COUNT(*), "
            f"COALESCE(SUM({filtros.format(op='LIKE')}), 0), "
            f"COALESCE(SUM({filtros.format(op='NOT LIKE')}), 0) FROM estudiantes"
        ),
        {"prefijo": PREFIJO_V1 + "%"},
    ).one()
    return Estado(int(fila[0]), int(fila[1]), int(fila[2]))


def verificar_clave(conexion: Connection) -> None:
    """
    Lanza DatosIlegibles si hay datos cifrados y DATA_ENCRYPTION_KEY falta o no es la
    clave con que se cifraron. Prueba un valor: todos se cifran con la misma clave.
    """
    muestra = conexion.execute(
        text("SELECT nombre_completo FROM estudiantes WHERE nombre_completo LIKE :prefijo LIMIT 1"),
        {"prefijo": PREFIJO_V1 + "%"},
    ).scalar()
    if muestra is None:
        return
    if not clave_datos_configurada():
        raise DatosIlegibles(MENSAJE_SIN_CLAVE)
    descifrar_dato(muestra)  # lanza DatosIlegibles si la clave no es la correcta


def cifrar_pendientes(conexion: Connection) -> int:
    """Cifra los valores en claro. Devuelve cuántos estudiantes se actualizaron."""
    if not clave_datos_configurada():
        raise RuntimeError("Sin DATA_ENCRYPTION_KEY no se puede cifrar")
    verificar_clave(conexion)  # no mezclar valores de dos claves distintas
    cambios: List[dict] = []
    for fila in conexion.execute(text(f"SELECT id, {_LISTA} FROM estudiantes")).mappings():
        nuevos = {
            c: cifrar_dato(fila[c]) for c in COLUMNAS if fila[c] is not None and not esta_cifrado(fila[c])
        }
        if nuevos:
            cambios.append({"id": fila["id"], **{c: nuevos.get(c, fila[c]) for c in COLUMNAS}})
    _actualizar(conexion, cambios)
    return len(cambios)


def descifrar_todos(conexion: Connection) -> int:
    """
    Deja en claro los valores cifrados (downgrade de la 0012). Lanza ValueError, sin
    cambiar nada, si alguno no cabe en el VARCHAR anterior.
    """
    verificar_clave(conexion)
    cambios: List[dict] = []
    for fila in conexion.execute(text(f"SELECT id, {_LISTA} FROM estudiantes")).mappings():
        if not any(esta_cifrado(fila[c]) for c in COLUMNAS):
            continue
        claros = {c: descifrar_dato(fila[c]) if fila[c] is not None else None for c in COLUMNAS}
        for columna, maximo in COLUMNAS.items():
            if claros[columna] is not None and len(claros[columna]) > maximo:
                raise ValueError(
                    f"El estudiante id={fila['id']} tiene {columna} de más de {maximo} "
                    "caracteres: no cabe en la columna anterior a la migración 0012."
                )
        cambios.append({"id": fila["id"], **claros})
    _actualizar(conexion, cambios)
    return len(cambios)


def _actualizar(conexion: Connection, cambios: List[dict]) -> None:
    if cambios:
        asignaciones = ", ".join(f"{c} = :{c}" for c in COLUMNAS)
        conexion.execute(text(f"UPDATE estudiantes SET {asignaciones} WHERE id = :id"), cambios)
