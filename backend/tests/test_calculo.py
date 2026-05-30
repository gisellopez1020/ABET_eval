"""Pruebas unitarias para el cálculo de notas ABET."""
from decimal import Decimal
import pytest
from unittest.mock import MagicMock

from app.utils.calculo import calcular_nota, calcular_nota_parcial, validar_suma_pesos


def _mock_criterio(cid: int, peso: float) -> MagicMock:
    c = MagicMock()
    c.id = cid
    c.peso_porcentaje = Decimal(str(peso))
    return c


# ─── calcular_nota ──────────────────────────────────────────────────────────

class TestCalcularNota:
    def test_todos_unos_10_criterios_iguales(self):
        """10 criterios de 10% con valor 1 → nota 5.0."""
        criterios = [_mock_criterio(i, 10) for i in range(1, 11)]
        valores = {i: 1 for i in range(1, 11)}
        assert calcular_nota(valores, criterios) == Decimal("5.0")

    def test_todos_ceros(self):
        """Todos los criterios en 0 → nota 0.0."""
        criterios = [_mock_criterio(i, 10) for i in range(1, 11)]
        valores = {i: 0 for i in range(1, 11)}
        assert calcular_nota(valores, criterios) == Decimal("0.0")

    def test_mitad_unos(self):
        """5 criterios de 10% con valor 1 y 5 con 0 → nota 2.5."""
        criterios = [_mock_criterio(i, 10) for i in range(1, 11)]
        valores = {i: 1 if i <= 5 else 0 for i in range(1, 11)}
        assert calcular_nota(valores, criterios) == Decimal("2.5")

    def test_pesos_desiguales(self):
        """Criterio de 40% en 1, criterio de 60% en 0 → nota 2.0."""
        c1 = _mock_criterio(1, 40)
        c2 = _mock_criterio(2, 60)
        nota = calcular_nota({1: 1, 2: 0}, [c1, c2])
        assert nota == Decimal("2.0")

    def test_criterio_faltante_cuenta_como_cero(self):
        """Si un criterio no está en valores, se trata como 0."""
        criterios = [_mock_criterio(1, 50), _mock_criterio(2, 50)]
        valores = {1: 1}  # criterio 2 ausente
        nota = calcular_nota(valores, criterios)
        assert nota == Decimal("2.5")

    def test_nota_no_excede_5(self):
        """La nota nunca supera 5.0 por errores de redondeo."""
        criterios = [_mock_criterio(1, 100)]
        nota = calcular_nota({1: 1}, criterios)
        assert nota <= Decimal("5.0")

    def test_nota_no_es_negativa(self):
        """La nota nunca es negativa."""
        criterios = [_mock_criterio(1, 100)]
        nota = calcular_nota({1: 0}, criterios)
        assert nota >= Decimal("0.0")


# ─── calcular_nota_parcial ───────────────────────────────────────────────────

class TestCalcularNotaParcial:
    def test_valor_uno_peso_10(self):
        """(1 × 10 / 100) × 5 = 0.5."""
        assert calcular_nota_parcial(1, Decimal("10")) == Decimal("0.5")

    def test_valor_cero(self):
        """Cualquier criterio con valor 0 aporta 0."""
        assert calcular_nota_parcial(0, Decimal("50")) == Decimal("0.0")

    def test_peso_100_valor_1(self):
        """Criterio único de 100% con valor 1 → puntaje 5.0."""
        assert calcular_nota_parcial(1, Decimal("100")) == Decimal("5.0")


# ─── validar_suma_pesos ──────────────────────────────────────────────────────

class TestValidarSumaPesos:
    def test_suma_exactamente_100(self):
        pesos = [Decimal("10")] * 10
        valido, total = validar_suma_pesos(pesos)
        assert valido is True
        assert total == Decimal("100")

    def test_suma_menos_100(self):
        pesos = [Decimal("10")] * 9  # 90%
        valido, total = validar_suma_pesos(pesos)
        assert valido is False
        assert total == Decimal("90")

    def test_suma_mas_100(self):
        pesos = [Decimal("10")] * 11  # 110%
        valido, total = validar_suma_pesos(pesos)
        assert valido is False
        assert total == Decimal("110")

    def test_pesos_fraccionarios(self):
        pesos = [Decimal("33.33"), Decimal("33.33"), Decimal("33.34")]
        valido, total = validar_suma_pesos(pesos)
        assert valido is True
        assert total == Decimal("100.00")
