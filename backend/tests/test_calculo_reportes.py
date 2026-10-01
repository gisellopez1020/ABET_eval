"""
Reglas de cálculo de los reportes ABET (services/calculo_reportes.py) probadas sin BD ni
HTTP: diccionarios de entrada, números de salida.
"""
from decimal import Decimal

import pytest

from app.models import Curso
from app.schemas.reporte import RangoReporte
from app.services.calculo_reportes import clasificar, distribucion, notas_bloque, orden_codigo, rangos_curso

RANGOS = [
    RangoReporte(etiqueta="bajo", minimo=0.0, maximo=2.9),
    RangoReporte(etiqueta="medio", minimo=3.0, maximo=3.9),
    RangoReporte(etiqueta="alto", minimo=4.0, maximo=5.0),
]
CON_HUECO = [RangoReporte(etiqueta="bajo", minimo=0.0, maximo=2.9), RangoReporte(etiqueta="alto", minimo=3.5, maximo=5.0)]


def test_orden_natural_de_codigos():
    assert sorted(["2.1.10", "10.1", "2.1.2", "2.1", "2.1.1"], key=orden_codigo) == [
        "2.1", "2.1.1", "2.1.2", "2.1.10", "10.1",
    ]


class TestClasificar:
    @pytest.mark.parametrize("nota,etiqueta", [
        ("0", "bajo"),
        ("2.94", "bajo"),     # redondea a 2.9
        ("2.95", "medio"),    # mitad hacia arriba: 3.0
        ("3.99", "alto"),     # redondea a 4.0
        ("5", "alto"),
    ])
    def test_redondea_a_un_decimal_mitad_hacia_arriba(self, nota, etiqueta):
        assert clasificar(Decimal(nota), RANGOS) == etiqueta

    def test_hueco_entre_rangos_queda_sin_clasificar(self):
        assert clasificar(Decimal("3.2"), CON_HUECO) is None


def test_distribucion_cuenta_por_rango_y_sin_clasificar():
    notas = [Decimal(n) for n in ("1", "3.2", "4.5", "4.0")]
    assert distribucion(notas, CON_HUECO) == ({"bajo": 1, "alto": 2}, 1)


class TestNotasBloque:
    def test_cada_aspecto_se_normaliza_a_su_escala(self):
        aspectos = {10: (1, "2.1.1", {1: Decimal(40), 2: Decimal(60)})}
        assert notas_bloque({1: 1, 2: 0}, aspectos) == {(1, "2.1.1"): Decimal(2)}

    def test_aspecto_incompleto_se_omite_no_cuenta_como_cero(self):
        aspectos = {
            10: (1, "2.1.1", {1: Decimal(50)}),
            11: (1, "2.1.2", {2: Decimal(25), 3: Decimal(25)}),  # falta el criterio 3
        }
        assert notas_bloque({1: 1, 2: 1}, aspectos) == {(1, "2.1.1"): Decimal(5)}

    def test_aspectos_con_el_mismo_codigo_en_una_actividad_forman_un_bloque(self):
        aspectos = {
            10: (1, "2.1.1", {1: Decimal(50)}),
            11: (1, "2.1.1", {2: Decimal(50)}),
            12: (2, "2.1.1", {3: Decimal(100)}),  # otra actividad: otro bloque
        }
        assert notas_bloque({1: 1, 2: 0, 3: 1}, aspectos) == {
            (1, "2.1.1"): Decimal("2.5"),
            (2, "2.1.1"): Decimal(5),
        }


class TestRangosCurso:
    def test_por_defecto_si_el_curso_no_tiene(self):
        assert [r.etiqueta for r in rangos_curso(Curso(rangos_calificacion=None))] == [
            "0.0-2.9", "3.0-3.9", "4.0-5.0",
        ]

    def test_ordenados_por_minimo(self):
        curso = Curso(rangos_calificacion=[
            {"etiqueta": "alto", "minimo": 4, "maximo": 5}, {"etiqueta": "bajo", "minimo": 0, "maximo": 3.9},
        ])
        assert [r.etiqueta for r in rangos_curso(curso)] == ["bajo", "alto"]
