"""
CatalogoService (services/catalogo.py) probado sin HTTP: se llama al servicio con una
sesión SQLite y se verifica el error de negocio que lanza o lo que deja en la BD,
incluido el rollback de la importación cuando algo falla mientras escribe.
"""
import ast
from pathlib import Path

import pytest

from app.models import RaAbetCatalogo
from app.schemas import RaAbetCreate
from app.services.catalogo import CatalogoService
from app.services.errores import (
    CambioDeNivel, CodigoConCriterios, CodigoDuplicado, CodigoEnUsoPorCursos, CodigoNoEliminable,
    CodigoNoEncontrado, CodigoVinculadoAAspectos, Conflicto, DatosInvalidos, ImportacionInvalida,
    PadreEsCriterio, PadreInexistente,
)
from tests.test_catalogo_ra_abet import _crear_curso, db_session  # noqa: F401 (fixtures)
from tests.test_reportes import _actividad


def _ra(codigo, **extra):
    return {"codigo": codigo, "competencia": "Diseño", "descripcion": f"Descripción {codigo}", **extra}


def _crit(codigo, padre, peso=1.0, **extra):
    return {"codigo": codigo, "descripcion": f"Criterio {codigo}", "codigo_padre": padre, "peso": peso, **extra}


def _item(datos):
    return RaAbetCreate(**datos)


@pytest.fixture()
def servicio(db_session):
    return CatalogoService(db_session)


@pytest.fixture()
def jerarquia(servicio):
    """RA 2.1 con su Criterio 2.1.1, y el RA 2.2 sin Criterios."""
    for datos in (_ra("2.1"), _crit("2.1.1", "2.1"), _ra("2.2")):
        servicio.crear(_item(datos).model_dump())


def _codigos(db_session):
    db_session.expire_all()
    return sorted(r.codigo for r in db_session.query(RaAbetCatalogo).all())


# ── Crear ────────────────────────────────────────────────────────────────────

class TestCrear:
    def test_criterio_hereda_la_competencia_del_ra(self, servicio, jerarquia):
        assert servicio.listar()[1].competencia == "Diseño"

    def test_duplicado(self, servicio, jerarquia):
        with pytest.raises(CodigoDuplicado) as exc:
            servicio.crear(_item(_ra("2.1")).model_dump())
        assert exc.value.codigo == "2.1"

    def test_padre_inexistente(self, servicio, db_session, jerarquia):
        with pytest.raises(PadreInexistente) as exc:
            servicio.crear(_item(_crit("9.1.1", "9.1")).model_dump())
        assert exc.value.codigo_padre == "9.1"
        assert "9.1.1" not in _codigos(db_session)

    def test_padre_que_es_criterio(self, servicio, jerarquia):
        with pytest.raises(PadreEsCriterio):
            servicio.crear(_item(_crit("2.1.1.1", "2.1.1")).model_dump())


# ── Editar ───────────────────────────────────────────────────────────────────

class TestEditar:
    def test_mover_criterio_a_otro_ra(self, servicio, jerarquia):
        assert servicio.editar("2.1.1", {"codigo_padre": "2.2", "peso": 0.5}).codigo_padre == "2.2"

    def test_inexistente(self, servicio):
        with pytest.raises(CodigoNoEncontrado, match="^El código '9.9' no existe en el catálogo$"):
            servicio.editar("9.9", {"descripcion": "X"})

    @pytest.mark.parametrize("codigo,cambios", [
        ("2.2", {"codigo_padre": "2.1", "peso": 0.5}),
        ("2.1.1", {"codigo_padre": None, "peso": None}),
    ])
    def test_cambio_de_nivel(self, servicio, jerarquia, codigo, cambios):
        with pytest.raises(CambioDeNivel) as exc:
            servicio.editar(codigo, cambios)
        assert exc.value.codigo == codigo

    def test_mover_a_padre_inexistente(self, servicio, jerarquia):
        with pytest.raises(PadreInexistente):
            servicio.editar("2.1.1", {"codigo_padre": "9.1", "peso": 0.5})


# ── Importar ─────────────────────────────────────────────────────────────────

class TestImportar:
    def test_criterios_antes_que_su_ra_en_el_archivo(self, servicio, db_session):
        resultado = servicio.importar([_item(_crit("4.1.1", "4.1")), _item(_ra("4.1"))])
        assert (resultado.creados, resultado.actualizados) == (2, 0)
        assert _codigos(db_session) == ["4.1", "4.1.1"]

    def test_errores_juntos_sin_escribir(self, servicio, db_session, jerarquia):
        items = [_item(_crit("2.2", "2.1")), _item(_ra("5.1")), _item(_crit("3.1.1", "3.1"))]
        with pytest.raises(ImportacionInvalida) as exc:
            servicio.importar(items)
        assert exc.value.errores == [
            "'2.2' cambiaría de nivel (Resultado de Aprendizaje <-> Criterio)",
            "el RA padre '3.1' de '3.1.1' no existe",
        ]
        assert _codigos(db_session) == ["2.1", "2.1.1", "2.2"]

    def test_falla_al_escribir_hace_rollback_y_propaga(self, servicio, db_session, jerarquia, monkeypatch):
        agregar = servicio.ra_abet.agregar

        def falla_con_criterios(ra):
            if ra.codigo_padre is not None:
                raise RuntimeError("falla simulada")
            return agregar(ra)

        monkeypatch.setattr(servicio.ra_abet, "agregar", falla_con_criterios)
        items = [_item(_ra("2.2", descripcion="Cambiada")), _item(_ra("5.1")), _item(_crit("5.1.1", "5.1"))]
        with pytest.raises(RuntimeError, match="falla simulada"):
            servicio.importar(items)

        # Ni el RA nuevo ya escrito con flush ni la actualización del existente quedan
        assert _codigos(db_session) == ["2.1", "2.1.1", "2.2"]
        assert db_session.get(RaAbetCatalogo, "2.2").descripcion == "Descripción 2.2"


# ── Eliminar ─────────────────────────────────────────────────────────────────

class TestEliminar:
    def test_sin_uso(self, servicio, db_session, jerarquia):
        servicio.eliminar("2.2")
        assert _codigos(db_session) == ["2.1", "2.1.1"]

    def test_con_criterios(self, servicio, jerarquia):
        with pytest.raises(CodigoConCriterios) as exc:
            servicio.eliminar("2.1")
        assert (exc.value.codigo, exc.value.cantidad) == ("2.1", 1)

    def test_en_uso_por_cursos(self, servicio, db_session, jerarquia):
        _crear_curso(db_session, ["2.2"])
        _crear_curso(db_session, ["2.2"], email="otro@uao.edu.co")
        with pytest.raises(CodigoEnUsoPorCursos) as exc:
            servicio.eliminar("2.2")
        assert exc.value.cantidad == 2

    def test_vinculado_a_aspectos(self, servicio, db_session, jerarquia):
        _actividad(db_session, _crear_curso(db_session, []), [("2.1.1", [100])])
        with pytest.raises(CodigoVinculadoAAspectos) as exc:
            servicio.eliminar("2.1.1")
        assert exc.value.cantidad == 1
        assert "2.1.1" in _codigos(db_session)

    def test_los_tres_motivos_comparten_base(self):
        for clase in (CodigoConCriterios, CodigoEnUsoPorCursos, CodigoVinculadoAAspectos):
            assert issubclass(clase, CodigoNoEliminable)
        assert issubclass(CodigoNoEliminable, Conflicto)
        assert issubclass(CodigoDuplicado, Conflicto)
        for clase in (PadreInexistente, PadreEsCriterio, CambioDeNivel, ImportacionInvalida):
            assert issubclass(clase, DatosInvalidos)


# ── Independencia de FastAPI ─────────────────────────────────────────────────

def test_no_depende_de_fastapi():
    """El servicio no importa nada de FastAPI ni de Starlette."""
    arbol = ast.parse((Path(__file__).parent.parent / "app/services/catalogo.py").read_text(encoding="utf-8"))
    importados = set()
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Import):
            importados.update(alias.name for alias in nodo.names)
        elif isinstance(nodo, ast.ImportFrom) and nodo.module:
            importados.add(nodo.module)
    raices = {nombre.split(".")[0] for nombre in importados}
    assert not raices & {"fastapi", "starlette"}
