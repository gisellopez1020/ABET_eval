"""
CriterioService (services/criterios.py) y la regla compartida actividad_del_docente
(services/acceso.py) probados sin HTTP: se llama al servicio con una sesión SQLite y se
verifica el error de negocio que lanza, el orden de las validaciones y lo que queda en la BD.
"""
import ast
from decimal import Decimal
from pathlib import Path

import pytest

from app.models import Actividad, Aspecto, Curso, RaAbetCatalogo
from app.models.actividad import TipoActividad
from app.repositories.actividad import ActividadRepository
from app.repositories.curso import CursoRepository
from app.schemas.criterio import AspectoIn, CriterioIn
from app.services.acceso import actividad_del_docente
from app.services.criterios import CriterioService
from app.services.errores import (
    ActividadNoEncontrada, AspectoNoEncontrado, CodigoAbetDesconocido, CodigoAbetEsResultado, Conflicto,
    DatosInvalidos, LimiteRaAbetCurso, PesosRubricaInvalidos, RubricaConCalificaciones, RubricaExcelInvalida,
    SinPermiso,
)
from app.utils.excel_parser import ExcelParserError
from tests.test_catalogo_ra_abet import MOCK_USER, db_session  # noqa: F401 (fixtures)
from tests.test_import_excel import _xlsx
from tests.test_rubrica_abet import _calificar

EMAIL = MOCK_USER["email"]


def _aspecto(codigo=None, pesos=(100,), nombre="A"):
    return AspectoIn(
        nombre=nombre, codigo_abet=codigo,
        criterios=[CriterioIn(texto=f"C{i}", peso_porcentaje=Decimal(str(p)), orden=i) for i, p in enumerate(pesos)],
    )


@pytest.fixture()
def actividad(db_session):
    """Curso 'Redes' (con un RA antiguo en texto libre) + 'Lab 1' + catálogo 2.1/2.1.1 y 4.1/4.1.1."""
    curso = Curso(nombre="Redes", codigo="R-1", periodo="2026-2", docente_email=EMAIL, ra_abet=["RA1: viejo"])
    db_session.add(curso)
    db_session.flush()
    act = Actividad(nombre="Lab 1", tipo=TipoActividad.individual, peso_nota_final=20, curso_id=curso.id)
    db_session.add(act)
    for ra in ("2.1", "4.1"):
        db_session.add(RaAbetCatalogo(codigo=ra, competencia="C", descripcion=ra))
    db_session.flush()
    for crit, padre in (("2.1.1", "2.1"), ("4.1.1", "4.1")):
        db_session.add(RaAbetCatalogo(codigo=crit, competencia="C", descripcion=crit, codigo_padre=padre, peso=1))
    db_session.commit()
    return act


@pytest.fixture()
def servicio(db_session):
    return CriterioService(db_session)


def _estado(db_session, actividad):
    """(nombres y vínculos de los aspectos, ra_abet del curso) tal como están en la BD."""
    db_session.expire_all()
    aspectos = db_session.query(Aspecto).filter_by(actividad_id=actividad.id).order_by(Aspecto.orden).all()
    return [(a.nombre, a.codigo_abet) for a in aspectos], db_session.get(Curso, actividad.curso_id).ra_abet


# ── actividad_del_docente (services/acceso.py) ───────────────────────────────

class TestActividadDelDocente:
    def _llamar(self, db_session, actividad_id, email=EMAIL):
        return actividad_del_docente(ActividadRepository(db_session), CursoRepository(db_session), actividad_id, email)

    def test_devuelve_la_actividad(self, db_session, actividad):
        assert self._llamar(db_session, actividad.id) is actividad

    def test_inexistente(self, db_session):
        with pytest.raises(ActividadNoEncontrada):
            self._llamar(db_session, 99999)

    def test_de_otro_docente(self, db_session, actividad):
        with pytest.raises(SinPermiso, match="^No tiene permiso sobre esta actividad$"):
            self._llamar(db_session, actividad.id, email="otro@uao.edu.co")


# ── Reemplazar ───────────────────────────────────────────────────────────────

class TestReemplazar:
    def test_guarda_y_agrega_los_ra_al_curso(self, servicio, db_session, actividad):
        resp = servicio.reemplazar(actividad.id, EMAIL, [_aspecto("2.1.1", (50,), "X"), _aspecto(None, (50,), "Y")])
        assert resp.total_peso == Decimal("100")
        assert _estado(db_session, actividad) == ([("X", "2.1.1"), ("Y", None)], ["RA1: viejo", "2.1"])

    def test_pesos(self, servicio, db_session, actividad):
        with pytest.raises(PesosRubricaInvalidos) as exc:
            servicio.reemplazar(actividad.id, EMAIL, [_aspecto(None, (60, 30))])
        assert exc.value.total == Decimal("90")
        assert _estado(db_session, actividad) == ([], ["RA1: viejo"])

    def test_codigo_desconocido(self, servicio, actividad):
        with pytest.raises(CodigoAbetDesconocido) as exc:
            servicio.reemplazar(actividad.id, EMAIL, [_aspecto("9.9.9")])
        assert exc.value.codigo == "9.9.9"

    def test_codigo_que_es_un_ra(self, servicio, actividad):
        with pytest.raises(CodigoAbetEsResultado):
            servicio.reemplazar(actividad.id, EMAIL, [_aspecto("2.1")])

    def test_limite_de_ra_sin_cambios(self, servicio, db_session, actividad):
        servicio.reemplazar(actividad.id, EMAIL, [_aspecto(None)])
        curso = db_session.get(Curso, actividad.curso_id)
        viejos = [f"viejo {i}" for i in range(10)]
        curso.ra_abet = viejos
        db_session.commit()
        with pytest.raises(LimiteRaAbetCurso) as exc:
            servicio.reemplazar(actividad.id, EMAIL, [_aspecto("2.1.1", (50,)), _aspecto("4.1.1", (50,))])
        assert (exc.value.faltantes, exc.value.actuales, exc.value.maximo) == (["2.1", "4.1"], 10, 10)
        assert _estado(db_session, actividad) == ([("A", None)], viejos)

    def test_calificaciones_se_revisan_antes_que_los_pesos(self, servicio, db_session, actividad):
        servicio.reemplazar(actividad.id, EMAIL, [_aspecto(None)])
        _calificar(db_session, actividad)
        with pytest.raises(RubricaConCalificaciones) as exc:
            servicio.reemplazar(actividad.id, EMAIL, [_aspecto("9.9.9", (60,))])
        assert exc.value.nombre == "Lab 1"

    def test_pesos_se_revisan_antes_que_los_codigos(self, servicio, actividad):
        with pytest.raises(PesosRubricaInvalidos):
            servicio.reemplazar(actividad.id, EMAIL, [_aspecto("9.9.9", (60,))])


# ── Leer Excel ───────────────────────────────────────────────────────────────

class TestLeerExcel:
    def test_no_guarda_nada(self, servicio, db_session, actividad):
        rubrica = servicio.leer_excel(actividad.id, EMAIL, _xlsx([("Aspecto", "Criterio", "%"), ("D", "x", 100)]))
        assert [a["nombre"] for a in rubrica["aspectos"]] == ["D"]
        assert _estado(db_session, actividad)[0] == []

    def test_traduce_el_error_del_parser(self, servicio, actividad):
        with pytest.raises(RubricaExcelInvalida, match="^El archivo debe tener al menos 3 columnas") as exc:
            servicio.leer_excel(actividad.id, EMAIL, _xlsx([("Aspecto", "Criterio")]))
        assert isinstance(exc.value.__cause__, ExcelParserError)

    def test_con_calificaciones(self, servicio, db_session, actividad):
        servicio.reemplazar(actividad.id, EMAIL, [_aspecto(None)])
        _calificar(db_session, actividad)
        with pytest.raises(RubricaConCalificaciones):
            servicio.leer_excel(actividad.id, EMAIL, b"")


# ── Vincular código ABET ─────────────────────────────────────────────────────

class TestVincular:
    @pytest.fixture()
    def aspecto(self, servicio, actividad):
        return servicio.reemplazar(actividad.id, EMAIL, [_aspecto(None)]).aspectos[0]

    def test_se_permite_con_calificaciones(self, servicio, db_session, actividad, aspecto):
        _calificar(db_session, actividad)
        vinculado = servicio.vincular_codigo_abet(actividad.id, aspecto.id, EMAIL, "2.1.1")
        assert vinculado.codigo_abet == "2.1.1"
        assert _estado(db_session, actividad) == ([("A", "2.1.1")], ["RA1: viejo", "2.1"])

    def test_none_desvincula(self, servicio, actividad, aspecto):
        servicio.vincular_codigo_abet(actividad.id, aspecto.id, EMAIL, "2.1.1")
        assert servicio.vincular_codigo_abet(actividad.id, aspecto.id, EMAIL, None).codigo_abet is None

    def test_aspecto_de_otra_actividad(self, servicio, db_session, actividad, aspecto):
        otra = Actividad(nombre="Otra", tipo=TipoActividad.individual, peso_nota_final=10, curso_id=actividad.curso_id)
        db_session.add(otra)
        db_session.commit()
        with pytest.raises(AspectoNoEncontrado):
            servicio.vincular_codigo_abet(otra.id, aspecto.id, EMAIL, "2.1.1")

    def test_codigo_invalido_no_cambia_nada(self, servicio, db_session, actividad, aspecto):
        with pytest.raises(CodigoAbetEsResultado):
            servicio.vincular_codigo_abet(actividad.id, aspecto.id, EMAIL, "2.1")
        assert _estado(db_session, actividad) == ([("A", None)], ["RA1: viejo"])


def test_categorias():
    assert issubclass(RubricaConCalificaciones, Conflicto)
    for clase in (PesosRubricaInvalidos, CodigoAbetDesconocido, CodigoAbetEsResultado,
                  LimiteRaAbetCurso, RubricaExcelInvalida):
        assert issubclass(clase, DatosInvalidos)


# ── Independencia de FastAPI ─────────────────────────────────────────────────

@pytest.mark.parametrize("modulo", ["app/services/criterios.py", "app/services/acceso.py"])
def test_no_depende_de_fastapi(modulo):
    """El servicio y la regla de acceso no importan nada de FastAPI ni de Starlette."""
    arbol = ast.parse((Path(__file__).parent.parent / modulo).read_text(encoding="utf-8"))
    importados = set()
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Import):
            importados.update(alias.name for alias in nodo.names)
        elif isinstance(nodo, ast.ImportFrom) and nodo.module:
            importados.add(nodo.module)
    raices = {nombre.split(".")[0] for nombre in importados}
    assert not raices & {"fastapi", "starlette"}
