"""
Cálculo puro de los reportes ABET: notas por bloque, clasificación en rangos,
distribución y orden de los códigos. Sin base de datos ni HTTP: recibe datos ya
cargados y devuelve números, así que estas reglas se prueban directamente.

ReporteService (services/reportes.py) consulta los datos y arma los reportes con
estas funciones.
"""
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from app.models import Curso
from app.models.curso import RANGOS_CALIFICACION_DEFAULT
from app.schemas.reporte import RangoReporte

CINCO = Decimal("5")
UN_DECIMAL = Decimal("0.1")

# Fuente de calificaciones: ("e", estudiante_id) o ("t", equipo_id)
Fuente = tuple[str, int]
# {aspecto_id: (actividad_id, clave de bloque, {criterio_id: peso})}
Aspectos = dict[int, tuple[int, str, dict[int, Decimal]]]


def orden_codigo(codigo: str) -> tuple:
    """Orden natural de códigos: "2.1.2" antes de "2.1.10"."""
    return tuple((0, int(p), "") if p.isdigit() else (1, 0, p) for p in codigo.split("."))


def clasificar(nota: Decimal, rangos: list[RangoReporte]) -> Optional[str]:
    """
    Redondea a 1 decimal (mitad hacia arriba) y busca el rango [minimo, maximo]
    que la contiene. None si cae en un hueco entre rangos.
    """
    nota = nota.quantize(UN_DECIMAL, rounding=ROUND_HALF_UP)
    for r in rangos:
        if Decimal(str(r.minimo)) <= nota <= Decimal(str(r.maximo)):
            return r.etiqueta
    return None


def distribucion(notas: list[Decimal], rangos: list[RangoReporte]) -> tuple[dict[str, int], int]:
    """({etiqueta: cuántas notas caen en el rango}, cuántas quedan sin clasificar)."""
    conteo = {r.etiqueta: 0 for r in rangos}
    sin_clasificar = 0
    for nota in notas:
        etiqueta = clasificar(nota, rangos)
        if etiqueta is None:
            sin_clasificar += 1
        else:
            conteo[etiqueta] += 1
    return conteo, sin_clasificar


def notas_bloque(valores: dict[int, int], aspectos: Aspectos) -> dict[tuple[int, str], Decimal]:
    """
    Nota 0-5 de cada bloque (actividad, codigo_abet) para una fuente de calificaciones.
    Cada aspecto se normaliza a su propia escala: 5 * sum(valor_i * p_i) / sum(p_i),
    sin importar cuánto pese dentro de la actividad. Los aspectos de una misma
    actividad vinculados al mismo código forman un solo bloque. Un aspecto sin
    todos sus criterios calificados se omite (no cuenta como 0).
    """
    acumulado: dict[tuple[int, str], list[Decimal]] = defaultdict(lambda: [Decimal(0), Decimal(0)])
    for actividad_id, codigo, pesos in aspectos.values():
        if not all(cid in valores for cid in pesos):
            continue
        suma = acumulado[(actividad_id, codigo)]
        for cid, peso in pesos.items():
            suma[0] += valores[cid] * peso
            suma[1] += peso
    return {bloque: CINCO * vp / p for bloque, (vp, p) in acumulado.items() if p > 0}


def rangos_curso(curso: Curso) -> list[RangoReporte]:
    """Los rangos de calificación del curso (o los por defecto), de menor a mayor."""
    return sorted(
        (RangoReporte(**r) for r in (curso.rangos_calificacion or RANGOS_CALIFICACION_DEFAULT)),
        key=lambda r: r.minimo,
    )
