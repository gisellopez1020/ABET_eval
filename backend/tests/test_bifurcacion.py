"""Pruebas para la lógica de bifurcación individual/grupal."""
from decimal import Decimal
import pytest
from unittest.mock import MagicMock, patch

from app.models.actividad import TipoActividad
from app.schemas.calificacion import CalificacionCreate, ValorCriterio


class TestBifurcacionTipo:
    def test_tipo_grupal_enum(self):
        """El enum TipoActividad debe tener los valores correctos."""
        assert TipoActividad.grupal.value == "grupal"
        assert TipoActividad.individual.value == "individual"

    def test_tipo_grupal_es_str(self):
        """TipoActividad hereda de str para serialización JSON."""
        assert isinstance(TipoActividad.grupal, str)

    def test_calificacion_require_equipo_o_estudiante(self):
        """CalificacionCreate debe rechazar body sin equipo ni estudiante."""
        with pytest.raises(Exception):
            CalificacionCreate(
                actividad_id=1,
                criterios=[ValorCriterio(criterio_id=1, valor=1)],
                equipo_id=None,
                estudiante_id=None,
            )

    def test_calificacion_rechaza_ambos(self):
        """CalificacionCreate debe rechazar body con equipo Y estudiante."""
        with pytest.raises(Exception):
            CalificacionCreate(
                actividad_id=1,
                criterios=[ValorCriterio(criterio_id=1, valor=1)],
                equipo_id=1,
                estudiante_id=1,
            )

    def test_calificacion_acepta_solo_equipo(self):
        """CalificacionCreate con solo equipo_id debe ser válido."""
        body = CalificacionCreate(
            actividad_id=1,
            criterios=[ValorCriterio(criterio_id=1, valor=1)],
            equipo_id=5,
            estudiante_id=None,
        )
        assert body.equipo_id == 5
        assert body.estudiante_id is None

    def test_calificacion_acepta_solo_estudiante(self):
        """CalificacionCreate con solo estudiante_id debe ser válido."""
        body = CalificacionCreate(
            actividad_id=1,
            criterios=[ValorCriterio(criterio_id=1, valor=0)],
            equipo_id=None,
            estudiante_id=3,
        )
        assert body.estudiante_id == 3
        assert body.equipo_id is None

    def test_valor_criterio_solo_0_o_1(self):
        """ValorCriterio rechaza valores distintos de 0 y 1."""
        with pytest.raises(Exception):
            ValorCriterio(criterio_id=1, valor=2)

    def test_valor_criterio_negativo(self):
        """ValorCriterio rechaza valor negativo."""
        with pytest.raises(Exception):
            ValorCriterio(criterio_id=1, valor=-1)

    def test_nota_grupal_mismos_criterios(self):
        """La nota de un equipo usa la misma fórmula que la individual."""
        from app.utils.calculo import calcular_nota
        criterios = [MagicMock(id=i, peso_porcentaje=Decimal("10")) for i in range(1, 11)]
        valores_todos_uno = {i: 1 for i in range(1, 11)}
        nota = calcular_nota(valores_todos_uno, criterios)
        assert nota == Decimal("5.0")
