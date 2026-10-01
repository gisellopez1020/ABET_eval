"""
ActividadService (services/actividades.py) probado sin HTTP: se llama al servicio con
una sesión SQLite y se verifica el error de negocio que lanza o lo que devuelve.
"""
import ast
from decimal import Decimal
from pathlib import Path

import pytest

from app.models import Actividad
from app.models.actividad import TipoActividad
from app.schemas.actividad import ActividadDetalleOut
from app.services.actividades import ActividadService
from app.services.errores import (
    ActividadConCalificaciones, ActividadNoEncontrada, Conflicto, CursoNoEncontrado, SinPermiso,
)
from tests.test_catalogo_ra_abet import MOCK_USER, db_session  # noqa: F401 (fixtures)
from tests.test_exportar_estudiantes import _curso, _est
from tests.test_reportes import _actividad, _calificar

EMAIL = MOCK_USER["email"]
NUEVA = {"nombre": "Lab", "tipo": TipoActividad.grupal, "peso_nota_final": Decimal("15")}


@pytest.fixture()
def servicio(db_session):
    return ActividadService(db_session)


@pytest.fixture()
def curso(db_session):
    c, _ = _curso(db_session)
    return c


@pytest.fixture()
def ajeno(db_session):
    c, _ = _curso(db_session, "Ajena", "A-1", email="otro@uao.edu.co")
    return c


# ── Curso inexistente o ajeno: listar y crear ────────────────────────────────

POR_CURSO = {
    "listar": lambda s, cid: s.listar(cid, EMAIL),
    "crear": lambda s, cid: s.crear(cid, EMAIL, NUEVA),
}


@pytest.mark.parametrize("operacion", POR_CURSO)
def test_curso_inexistente(servicio, operacion):
    with pytest.raises(CursoNoEncontrado):
        POR_CURSO[operacion](servicio, 99999)


@pytest.mark.parametrize("operacion", POR_CURSO)
def test_curso_de_otro_docente_no_crea_nada(servicio, db_session, ajeno, operacion):
    with pytest.raises(SinPermiso, match="^No tiene permiso sobre este curso$"):
        POR_CURSO[operacion](servicio, ajeno.id)
    assert db_session.query(Actividad).count() == 0


# ── Actividad inexistente o ajena: obtener, editar y eliminar ────────────────

POR_ACTIVIDAD = {
    "obtener": lambda s, aid: s.obtener(aid, EMAIL),
    "editar": lambda s, aid: s.editar(aid, EMAIL, {"nombre": "Otro"}),
    "eliminar": lambda s, aid: s.eliminar(aid, EMAIL),
}


@pytest.mark.parametrize("operacion", POR_ACTIVIDAD)
def test_actividad_inexistente(servicio, operacion):
    with pytest.raises(ActividadNoEncontrada, match="^Actividad no encontrada$"):
        POR_ACTIVIDAD[operacion](servicio, 99999)


@pytest.mark.parametrize("operacion", POR_ACTIVIDAD)
def test_actividad_de_otro_docente_sin_cambios(servicio, db_session, ajeno, operacion):
    act, _ = _actividad(db_session, ajeno, [])
    with pytest.raises(SinPermiso, match="^No tiene permiso sobre esta actividad$"):
        POR_ACTIVIDAD[operacion](servicio, act.id)
    db_session.expire_all()
    assert db_session.get(Actividad, act.id).nombre == "Act"


def test_actividad_de_un_curso_inexistente_es_sin_permiso(servicio, db_session, curso, monkeypatch):
    """
    Se conserva el comportamiento previo: 403, no 404, si el curso de la actividad no existe.
    Con las FK activas la BD no permite ese estado, así que se simula que el curso no aparece.
    """
    act, _ = _actividad(db_session, curso, [])
    monkeypatch.setattr(servicio.cursos, "get", lambda curso_id: None)
    with pytest.raises(SinPermiso, match="^No tiene permiso sobre esta actividad$"):
        servicio.obtener(act.id, EMAIL)


# ── Totales de pesos y detalle ───────────────────────────────────────────────

def test_listar_con_totales(servicio, db_session, curso):
    con_rubrica, _ = _actividad(db_session, curso, [(None, [60, 40])])
    sin_rubrica, _ = _actividad(db_session, curso, [])
    totales = {a.id: a.total_peso_criterios for a in servicio.listar(curso.id, EMAIL)}
    assert totales == {con_rubrica.id: Decimal("100"), sin_rubrica.id: Decimal("0")}


def test_crear_devuelve_la_entidad_persistida(servicio, db_session, curso):
    actividad = servicio.crear(curso.id, EMAIL, NUEVA)
    assert isinstance(actividad, Actividad)
    db_session.rollback()  # el servicio ya hizo commit
    assert db_session.get(Actividad, actividad.id).nombre == "Lab"


def test_obtener_detalle_con_aspectos(servicio, db_session, curso):
    act, [[c1, c2]] = _actividad(db_session, curso, [(None, [60, 40])])
    detalle = servicio.obtener(act.id, EMAIL)
    assert isinstance(detalle, ActividadDetalleOut)
    assert detalle.total_peso_criterios == Decimal("100")
    assert [c.id for c in detalle.aspectos[0].criterios] == [c1.id, c2.id]


def test_editar_solo_lo_enviado_con_total(servicio, db_session, curso):
    act, _ = _actividad(db_session, curso, [(None, [100])])
    editada = servicio.editar(act.id, EMAIL, {"peso_nota_final": Decimal("35")})
    assert (editada.nombre, editada.peso_nota_final, editada.total_peso_criterios) == (
        "Act", Decimal("35"), Decimal("100")
    )


# ── Eliminar ─────────────────────────────────────────────────────────────────

def test_eliminar_sin_calificaciones(servicio, db_session, curso):
    act, _ = _actividad(db_session, curso, [(None, [100])])
    servicio.eliminar(act.id, EMAIL)
    assert db_session.get(Actividad, act.id) is None


def test_eliminar_con_calificaciones_lanza_conflicto_y_no_borra(servicio, db_session):
    curso, [s1] = _curso(db_session, "Bases", "BD-1")
    act, [criterios] = _actividad(db_session, curso, [(None, [100])])
    _calificar(db_session, criterios, [1], estudiante=_est(db_session, s1, "ANA", "1"))
    with pytest.raises(ActividadConCalificaciones) as exc:
        servicio.eliminar(act.id, EMAIL)
    assert exc.value.nombre == "Act"
    assert str(exc.value) == "No se puede eliminar 'Act' porque ya tiene calificaciones registradas."
    assert isinstance(exc.value, Conflicto)
    assert db_session.get(Actividad, act.id) is not None


# ── Independencia de FastAPI ─────────────────────────────────────────────────

def test_no_depende_de_fastapi():
    """El servicio no importa nada de FastAPI ni de Starlette."""
    arbol = ast.parse((Path(__file__).parent.parent / "app/services/actividades.py").read_text(encoding="utf-8"))
    importados = set()
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Import):
            importados.update(alias.name for alias in nodo.names)
        elif isinstance(nodo, ast.ImportFrom) and nodo.module:
            importados.add(nodo.module)
    raices = {nombre.split(".")[0] for nombre in importados}
    assert not raices & {"fastapi", "starlette"}
