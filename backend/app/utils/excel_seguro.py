"""
Texto importado escrito en celdas de Excel sin que se vuelva fórmula (CWE-1236).

openpyxl guarda como fórmula cualquier str que empiece con "=". Aquí la celda se
fuerza a texto y se marca con quotePrefix (el apóstrofo oculto de Excel), sin cambiar
el valor: la lista exportada se reimporta tal cual. "+", "-" y "@" no hace falta
tocarlos porque openpyxl ya los guarda como texto.

Solo para texto que viene del usuario; las fórmulas propias del backend no pasan por aquí.
"""
from openpyxl.cell.cell import Cell
from openpyxl.worksheet.worksheet import Worksheet


def texto_seguro_para_excel(celda: Cell) -> Cell:
    """Si la celda tiene un str que openpyxl tomaría como fórmula, lo deja como texto literal."""
    if isinstance(celda.value, str) and celda.value.startswith("="):
        celda.data_type = "s"
        celda.quotePrefix = True
    return celda


def escribir_texto(ws: Worksheet, coordenada: str, valor) -> Cell:
    ws[coordenada] = valor
    return texto_seguro_para_excel(ws[coordenada])
