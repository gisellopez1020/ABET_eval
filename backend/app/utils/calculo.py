from decimal import Decimal
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.criterio import Criterio


def calcular_nota(valores: dict[int, int], criterios: list["Criterio"]) -> Decimal:
    """
    Calcula la nota total en escala 0.0 – 5.0.

    valores: {criterio_id: 0|1}
    criterios: lista de objetos Criterio con id y peso_porcentaje
    Retorna nota con 4 decimales.
    """
    total = sum(
        valores.get(c.id, 0) * float(c.peso_porcentaje) / 100
        for c in criterios
    )
    nota = round(total * 5, 4)
    # Guardar contra errores de redondeo en los extremos
    nota = max(0.0, min(5.0, nota))
    return Decimal(str(nota))


def calcular_nota_parcial(valor: int, peso_porcentaje: Decimal) -> Decimal:
    """
    Calcula la contribución de un criterio a la nota total.
    puntaje_fila = (valor × peso / 100) × 5
    """
    parcial = int(valor) * float(peso_porcentaje) / 100 * 5
    return Decimal(str(round(parcial, 4)))


def validar_suma_pesos(pesos: list[Decimal]) -> tuple[bool, Decimal]:
    """
    Verifica que la suma de pesos sea exactamente 100.
    Retorna (es_valido, suma_actual).
    """
    total = sum(pesos)
    return (total == Decimal("100"), total)
