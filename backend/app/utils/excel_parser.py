"""
Parser para el Excel estructurado de criterios ABET.

Formato esperado de columnas:
  Aspecto | Criterio | %Criterio | Grupo1 | Calificación | Grupo2 | Calificación ...

El parser propaga el nombre del aspecto hacia abajo cuando hay celdas fusionadas.
"""
from decimal import Decimal
from typing import Any

from app.utils.excel_lectura import ExcelIlegible, leer_primera_hoja


class ExcelParserError(Exception):
    pass


def _vacia(v: Any) -> bool:
    """Celda vacía, fusionada (llega como None) o con solo espacios."""
    return v is None or not str(v).strip()


def _propagar_aspecto(valores: list[Any]) -> list[str]:
    """Rellena hacia abajo el nombre del aspecto cuando hay celdas vacías (merge)."""
    actual = None
    resultado = []
    for v in valores:
        if not _vacia(v):
            actual = str(v).strip()
        resultado.append(actual)
    return resultado


def parsear_excel_criterios(contenido: bytes) -> dict:
    """
    Parsea un Excel con el formato de criterios ABET.

    Retorna:
    {
        "aspectos": [
            {
                "nombre": "Cálculos de Subredes",
                "criterios": [
                    {"texto": "Se calculó...", "peso_porcentaje": Decimal("10.00")},
                    ...
                ]
            },
            ...
        ],
        "total_peso": Decimal("100.00")
    }

    Lanza ExcelParserError si el archivo no tiene el formato esperado o los pesos no suman 100.
    """
    try:
        filas = leer_primera_hoja(contenido)
    except ExcelIlegible as exc:
        raise ExcelParserError(f"No se pudo leer el archivo Excel: {exc}") from exc

    # Columnas por posición (el encabezado de la fila 1 no importa): Aspecto, Criterio, %Criterio
    if not filas or len(filas[0]) < 3:
        raise ExcelParserError(
            "El archivo debe tener al menos 3 columnas: Aspecto, Criterio, %Criterio"
        )

    datos = filas[1:]
    aspectos_raw = _propagar_aspecto([f[0] for f in datos])
    criterios_raw = [f[1] for f in datos]
    pesos_raw = [f[2] for f in datos]

    aspectos: dict[str, list[dict]] = {}
    orden_aspectos: list[str] = []
    total_peso = Decimal("0")

    for i, (aspecto, criterio, peso) in enumerate(zip(aspectos_raw, criterios_raw, pesos_raw), start=2):
        if aspecto is None:
            continue
        if _vacia(criterio):
            continue
        if _vacia(peso):
            raise ExcelParserError(f"Fila {i}: falta el peso")
        try:
            peso_dec = Decimal(str(peso)).quantize(Decimal("0.01"))
        except Exception:
            raise ExcelParserError(
                f"Fila {i}: el peso '{peso}' no es un número válido"
            )

        if aspecto not in aspectos:
            aspectos[aspecto] = []
            orden_aspectos.append(aspecto)

        aspectos[aspecto].append({
            "texto": str(criterio).strip(),
            "peso_porcentaje": peso_dec,
        })
        total_peso += peso_dec

    if not aspectos:
        raise ExcelParserError("No se encontraron criterios en el archivo")

    if total_peso != Decimal("100"):
        raise ExcelParserError(
            f"Los criterios suman {total_peso}%. Deben sumar exactamente 100%."
        )

    return {
        "aspectos": [
            {"nombre": nombre, "criterios": criterios}
            for nombre, criterios in aspectos.items()
        ],
        "total_peso": total_peso,
    }
