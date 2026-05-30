"""Pruebas de validación de suma de criterios en el endpoint PUT /criterios."""
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from main import app

client = TestClient(app)

MOCK_USER = {"email": "profesor.test@uao.edu.co", "nombre": "Profesor Test"}


def _payload_criterios(pesos: list[float]) -> dict:
    return {
        "aspectos": [
            {
                "nombre": "Aspecto de prueba",
                "orden": 0,
                "criterios": [
                    {"texto": f"Criterio {i+1}", "peso_porcentaje": p, "orden": i}
                    for i, p in enumerate(pesos)
                ],
            }
        ]
    }


class TestValidacionSumaCriterios:
    def test_suma_100_es_valida(self):
        """Pesos que suman exactamente 100% deben ser aceptados (mock BD)."""
        from app.utils.calculo import validar_suma_pesos
        pesos = [Decimal(str(p)) for p in [10, 10, 10, 10, 10, 10, 10, 10, 10, 10]]
        valido, total = validar_suma_pesos(pesos)
        assert valido is True

    def test_suma_90_es_invalida(self):
        """Pesos que suman 90% deben ser rechazados."""
        from app.utils.calculo import validar_suma_pesos
        pesos = [Decimal("10")] * 9
        valido, total = validar_suma_pesos(pesos)
        assert valido is False
        assert total == Decimal("90")

    def test_suma_110_es_invalida(self):
        """Pesos que suman 110% deben ser rechazados."""
        from app.utils.calculo import validar_suma_pesos
        pesos = [Decimal("10")] * 11
        valido, total = validar_suma_pesos(pesos)
        assert valido is False

    def test_un_criterio_100_es_valido(self):
        """Un único criterio con 100% es válido."""
        from app.utils.calculo import validar_suma_pesos
        valido, total = validar_suma_pesos([Decimal("100")])
        assert valido is True

    def test_criterio_peso_negativo_falla_pydantic(self):
        """Peso negativo debe ser rechazado por el schema Pydantic."""
        from app.schemas.criterio import CriterioIn
        with pytest.raises(Exception):
            CriterioIn(texto="test", peso_porcentaje=Decimal("-10"))

    def test_criterio_peso_mayor_100_falla_pydantic(self):
        """Peso > 100 debe ser rechazado por el schema Pydantic."""
        from app.schemas.criterio import CriterioIn
        with pytest.raises(Exception):
            CriterioIn(texto="test", peso_porcentaje=Decimal("101"))
