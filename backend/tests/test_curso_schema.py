"""Validación de rangos_calificacion y limpieza de ra_abet en los schemas de curso (sin BD)."""
import pytest
from pydantic import ValidationError

from app.schemas.curso import CursoCreate, CursoUpdate, RangoCalificacion

BASE = {"nombre": "Curso", "codigo": "C-1", "periodo": "2026-1"}


def _rango(etiqueta: str, minimo: float, maximo: float) -> dict:
    return {"etiqueta": etiqueta, "minimo": minimo, "maximo": maximo}


class TestRangosCalificacion:
    def test_default_son_los_3_rangos_del_reporte(self):
        curso = CursoCreate(**BASE)
        assert [(r.etiqueta, r.minimo, r.maximo) for r in curso.rangos_calificacion] == [
            ("0.0-2.9", 0.0, 2.9),
            ("3.0-3.9", 3.0, 3.9),
            ("4.0-5.0", 4.0, 5.0),
        ]

    def test_lista_vacia_falla(self):
        with pytest.raises(ValidationError, match="al menos un rango"):
            CursoCreate(**BASE, rangos_calificacion=[])

    def test_mas_de_10_falla(self):
        rangos = [_rango(f"R{i}", i * 0.4, i * 0.4 + 0.3) for i in range(11)]
        with pytest.raises(ValidationError, match="Máximo 10"):
            CursoCreate(**BASE, rangos_calificacion=rangos)

    def test_solapados_falla(self):
        with pytest.raises(ValidationError, match="se solapan"):
            CursoCreate(**BASE, rangos_calificacion=[_rango("A", 0, 3.5), _rango("B", 3.0, 5)])

    def test_se_tocan_en_un_punto_es_solapamiento(self):
        """Intervalos cerrados: [0, 3] y [3, 4] comparten el 3."""
        with pytest.raises(ValidationError, match="se solapan"):
            CursoCreate(**BASE, rangos_calificacion=[_rango("A", 0, 3), _rango("B", 3, 4)])

    def test_huecos_permitidos(self):
        curso = CursoCreate(**BASE, rangos_calificacion=[_rango("Bajo", 0, 2), _rango("Alto", 4, 5)])
        assert len(curso.rangos_calificacion) == 2

    def test_un_solo_rango_valido(self):
        curso = CursoCreate(**BASE, rangos_calificacion=[_rango("Todo", 0, 5)])
        assert curso.rangos_calificacion[0].etiqueta == "Todo"

    def test_se_devuelven_ordenados_por_minimo(self):
        curso = CursoCreate(
            **BASE,
            rangos_calificacion=[_rango("Alto", 4, 5), _rango("Bajo", 0, 2.9), _rango("Medio", 3, 3.9)],
        )
        assert [r.etiqueta for r in curso.rangos_calificacion] == ["Bajo", "Medio", "Alto"]

    @pytest.mark.parametrize("minimo,maximo", [(3, 3), (4, 3)])
    def test_minimo_debe_ser_menor_que_maximo(self, minimo, maximo):
        with pytest.raises(ValidationError, match="menor que el máximo"):
            RangoCalificacion(etiqueta="X", minimo=minimo, maximo=maximo)

    @pytest.mark.parametrize("minimo,maximo", [(-0.1, 2), (4, 5.1)])
    def test_fuera_de_0_5_falla(self, minimo, maximo):
        with pytest.raises(ValidationError, match="entre 0.0 y 5.0"):
            RangoCalificacion(etiqueta="X", minimo=minimo, maximo=maximo)

    def test_etiqueta_vacia_falla(self):
        with pytest.raises(ValidationError, match="etiqueta"):
            RangoCalificacion(etiqueta="   ", minimo=0, maximo=1)

    def test_etiquetas_repetidas_falla(self):
        with pytest.raises(ValidationError, match="repetirse"):
            CursoCreate(**BASE, rangos_calificacion=[_rango("Bajo", 0, 2), _rango("bajo", 3, 5)])

    def test_update_sin_rangos_no_los_toca(self):
        assert CursoUpdate(nombre="Otro").rangos_calificacion is None

    def test_update_valida_rangos(self):
        with pytest.raises(ValidationError, match="se solapan"):
            CursoUpdate(rangos_calificacion=[_rango("A", 0, 3), _rango("B", 2, 4)])


class TestRaAbetCurso:
    def test_limpia_espacios_vacios_y_duplicados(self):
        curso = CursoCreate(**BASE, ra_abet=[" 2.1 ", "", "4.2", "2.1", "  "])
        assert curso.ra_abet == ["2.1", "4.2"]

    def test_mas_de_10_falla(self):
        with pytest.raises(ValidationError, match="Máximo 10"):
            CursoCreate(**BASE, ra_abet=[f"1.{i}" for i in range(11)])
