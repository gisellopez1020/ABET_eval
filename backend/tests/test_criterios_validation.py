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


class TestBloqueoConCalificaciones:
    def test_put_criterios_con_calificaciones_devuelve_409(self):
        """No se puede reemplazar la rúbrica si ya hay calificaciones (se borrarían en cascada)."""
        from app.database import get_db
        from app.auth.dependencies import get_current_user

        db = MagicMock()
        actividad = MagicMock(nombre="Lab 1")
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user] = lambda: MOCK_USER
        try:
            with patch("app.routers.criterios._verificar_actividad", return_value=actividad), \
                 patch("app.routers.criterios._tiene_calificaciones", return_value=True):
                resp = client.put("/actividades/1/criterios", json=_payload_criterios([100]))
        finally:
            app.dependency_overrides.clear()

        assert resp.status_code == 409
        assert "calificaciones" in resp.json()["detail"]
        db.delete.assert_not_called()
        db.commit.assert_not_called()
