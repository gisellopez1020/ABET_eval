"""
Parser para el Excel estructurado de criterios ABET.

Formato esperado de columnas:
  Aspecto | Criterio | %Criterio | Grupo1 | Calificación | Grupo2 | Calificación ...

El parser propaga el nombre del aspecto hacia abajo cuando hay celdas fusionadas.
"""
from decimal import Decimal
from typing import Any
import io

try:
    import pandas as pd
    import openpyxl
    _HAS_EXCEL = True
except ImportError:
    _HAS_EXCEL = False


class ExcelParserError(Exception):
    pass


def _propagar_aspecto(valores: list[Any]) -> list[str]:
    """Rellena hacia abajo el nombre del aspecto cuando hay celdas vacías (merge)."""
    actual = None
    resultado = []
    for v in valores:
        if v is not None and str(v).strip():
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
    if not _HAS_EXCEL:
        raise ExcelParserError("pandas y openpyxl son necesarios para parsear Excel")

    try:
        df = pd.read_excel(io.BytesIO(contenido), header=0)
    except Exception as exc:
        raise ExcelParserError(f"No se pudo leer el archivo Excel: {exc}") from exc

    columnas = list(df.columns)
    if len(columnas) < 3:
        raise ExcelParserError(
            "El archivo debe tener al menos 3 columnas: Aspecto, Criterio, %Criterio"
        )

    col_aspecto = columnas[0]
    col_criterio = columnas[1]
    col_peso = columnas[2]

    aspectos_raw = _propagar_aspecto(df[col_aspecto].tolist())
    criterios_raw = df[col_criterio].tolist()
    pesos_raw = df[col_peso].tolist()

    aspectos: dict[str, list[dict]] = {}
    orden_aspectos: list[str] = []
    total_peso = Decimal("0")

    for i, (aspecto, criterio, peso) in enumerate(zip(aspectos_raw, criterios_raw, pesos_raw), start=2):
        if aspecto is None:
            continue
        if not criterio or str(criterio).strip() == "":
            continue
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
