"""
CalificacionService (services/calificaciones.py) probado sin HTTP: se llama al servicio con
una sesión SQLite y se verifica el error de negocio que lanza, el orden de las validaciones
y lo que queda en la BD, incluido que un guardado inválido no escribe nada (sin depender de
un rollback) y que la calificación masiva no duplica filas de equipos calificados en parte.
"""
import ast
from decimal import Decimal
from pathlib import Path

import pytest

from app.models import Calificacion, EquipoTrabajo
from app.models.actividad import TipoActividad
from app.schemas.calificacion import ValorCriterio
from app.services.calificaciones import CalificacionService
from app.services.errores import (
    CalificacionNoEncontrada, CriterioFueraDeActividad, EquipoFueraDeActividad, EquipoNoPerteneceAActividad,
    EstudianteFueraDelCurso, EstudianteNoEncontrado, EstudianteNoPerteneceAlCurso, NoEncontrado,
    SeccionFueraDelCurso, SinPermiso, SolicitudInvalida,
)
from tests.test_catalogo_ra_abet import MOCK_USER, db_session  # noqa: F401 (fixtures)
from tests.test_exportar_estudiantes import _curso, _est
from tests.test_reportes import _actividad, _calificar

EMAIL = MOCK_USER["email"]


@pytest.fixture()
def servicio(db_session):
    return CalificacionService(db_session)


@pytest.fixture()
def ctx(db_session):
    """Curso con S1 y S2, Ana y Beto en S1, y un curso ajeno con Zoe."""
    curso, [s1, s2] = _curso(db_session, secciones=("S1", "S2"))
    ajeno, [sa] = _curso(db_session, "Ajena", "A-1", email="otro@uao.edu.co")
    return {"curso": curso, "s1": s1, "s2": s2, "ana": _est(db_session, s1, "Ana", "1"),
            "beto": _est(db_session, s1, "Beto", "2"), "zoe": _est(db_session, sa, "Zoe", "9")}


def _equipo(db_session, actividad, seccion, nombre="E1"):
    equipo = EquipoTrabajo(nombre=nombre, actividad_id=actividad.id, seccion_id=seccion.id)
    db_session.add(equipo)
    db_session.commit()
    return equipo


def _valores(criterios, valores):
    return [ValorCriterio(criterio_id=c.id, valor=v) for c, v in zip(criterios, valores)]


def _filas(db_session, **filtro):
    """{criterio_id: valor} de un equipo o estudiante, tal como lo ve la sesión (sin rollback)."""
    db_session.expire_all()
    return {c.criterio_id: c.valor for c in db_session.query(Calificacion).filter_by(**filtro).all()}


# ── Guardar ──────────────────────────────────────────────────────────────────

class TestGuardar:
    def test_reemplaza_sin_duplicar(self, servicio, db_session, ctx):
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [50, 50])])
        servicio.guardar(EMAIL, act.id, _valores(crits, [0, 0]), None, ctx["ana"].id)
        guardadas = servicio.guardar(EMAIL, act.id, _valores(crits, [1, 0]), None, ctx["ana"].id)
        assert [(g.valor, g.nota_calculada) for g in guardadas] == [(1, Decimal("2.5")), (0, Decimal("0"))]
        assert db_session.query(Calificacion).filter_by(estudiante_id=ctx["ana"].id).count() == 2

    def test_criterio_invalido_no_escribe_nada_ni_sin_rollback(self, servicio, db_session, ctx):
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [50, 50])])
        _, [ajenos] = _actividad(db_session, ctx["curso"], [(None, [100])])
        _calificar(db_session, crits[:1], [0], estudiante=ctx["ana"])
        with pytest.raises(CriterioFueraDeActividad) as exc:
            servicio.guardar(EMAIL, act.id, _valores([crits[0], crits[1], ajenos[0]], [1, 1, 1]), None, ctx["ana"].id)
        assert exc.value.criterio_id == ajenos[0].id
        # Sin rollback: la validación previa impide que se haya escrito (ni con flush) algo
        assert _filas(db_session, estudiante_id=ctx["ana"].id) == {crits[0].id: 0}

    def test_equipo_de_otra_actividad_antes_que_los_criterios(self, servicio, db_session, ctx):
        act, _ = _actividad(db_session, ctx["curso"], [(None, [100])], tipo=TipoActividad.grupal)
        otra, _ = _actividad(db_session, ctx["curso"], [(None, [100])], tipo=TipoActividad.grupal)
        _, [ajenos] = _actividad(db_session, ctx["curso"], [(None, [100])])
        equipo = _equipo(db_session, otra, ctx["s1"])
        with pytest.raises(EquipoNoPerteneceAActividad):
            servicio.guardar(EMAIL, act.id, _valores(ajenos, [1]), equipo.id, None)

    def test_estudiante_inexistente(self, servicio, db_session, ctx):
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [100])])
        with pytest.raises(EstudianteNoEncontrado):
            servicio.guardar(EMAIL, act.id, _valores(crits, [1]), None, 99999)

    def test_estudiante_de_otro_curso(self, servicio, db_session, ctx):
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [100])])
        with pytest.raises(EstudianteNoPerteneceAlCurso):
            servicio.guardar(EMAIL, act.id, _valores(crits, [1]), None, ctx["zoe"].id)


# ── Lecturas y resumen ───────────────────────────────────────────────────────

class TestLecturas:
    def test_equipo_de_otra_actividad(self, servicio, db_session, ctx):
        act, _ = _actividad(db_session, ctx["curso"], [(None, [100])], tipo=TipoActividad.grupal)
        otra, _ = _actividad(db_session, ctx["curso"], [(None, [100])], tipo=TipoActividad.grupal)
        with pytest.raises(EquipoFueraDeActividad):
            servicio.de_equipo(act.id, _equipo(db_session, otra, ctx["s1"]).id, EMAIL)

    def test_estudiante_de_otro_curso(self, servicio, db_session, ctx):
        act, _ = _actividad(db_session, ctx["curso"], [(None, [100])])
        with pytest.raises(EstudianteFueraDelCurso):
            servicio.de_estudiante(act.id, ctx["zoe"].id, EMAIL)

    def test_resumen_individual_y_seccion_de_otro_curso(self, servicio, db_session, ctx):
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [100])])
        _calificar(db_session, crits, [1], estudiante=ctx["ana"])
        resumen = servicio.resumen(act.id, ctx["s1"].id, EMAIL)
        assert [(r.nombre, r.calificado, r.nota_total) for r in resumen] == [
            ("Ana", True, Decimal("5.00")), ("Beto", False, None),
        ]
        with pytest.raises(SeccionFueraDelCurso):
            servicio.resumen(act.id, ctx["zoe"].seccion_id, EMAIL)


# ── Editar ───────────────────────────────────────────────────────────────────

class TestEditar:
    def test_recalcula_la_nota(self, servicio, db_session, ctx):
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [40, 60])])
        _calificar(db_session, crits, [0, 0], estudiante=ctx["ana"])
        cal = db_session.query(Calificacion).filter_by(criterio_id=crits[1].id).one()
        editada = servicio.editar(cal.id, EMAIL, 1)
        assert (editada.valor, editada.nota_calculada) == (1, Decimal("3.00"))

    def test_inexistente(self, servicio):
        with pytest.raises(CalificacionNoEncontrada):
            servicio.editar(99999, EMAIL, 1)

    def test_de_otro_docente_nombra_a_la_calificacion(self, servicio, db_session, ctx):
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [100])])
        _calificar(db_session, crits, [0], estudiante=ctx["ana"])
        cal = db_session.query(Calificacion).one()
        with pytest.raises(SinPermiso, match="^No tiene permiso sobre esta calificación$"):
            servicio.editar(cal.id, "otro@uao.edu.co", 1)
        db_session.expire_all()
        assert db_session.get(Calificacion, cal.id).valor == 0


# ── Masiva ───────────────────────────────────────────────────────────────────

class TestMasivo:
    def test_completo_intacto_parcial_sin_duplicar_vacio_completo(self, servicio, db_session, ctx):
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [20, 30, 50])], tipo=TipoActividad.grupal)
        completo = _equipo(db_session, act, ctx["s1"], "Completo")
        parcial = _equipo(db_session, act, ctx["s1"], "Parcial")
        vacio = _equipo(db_session, act, ctx["s1"], "Vacío")
        _calificar(db_session, crits, [0, 0, 0], equipo=completo)
        _calificar(db_session, crits[:2], [0, 1], equipo=parcial)

        guardadas = servicio.masivo(act.id, ctx["s1"].id, EMAIL, _valores(crits, [1, 1, 1]))
        assert sorted((g.equipo_id, g.criterio_id) for g in guardadas) == sorted(
            [(parcial.id, crits[2].id)] + [(vacio.id, c.id) for c in crits]
        )
        assert _filas(db_session, equipo_id=completo.id) == {c.id: 0 for c in crits}
        assert _filas(db_session, equipo_id=parcial.id) == {crits[0].id: 0, crits[1].id: 1, crits[2].id: 1}
        assert db_session.query(Calificacion).filter_by(equipo_id=parcial.id).count() == 3

    def test_criterio_repetido_y_ajeno(self, servicio, db_session, ctx):
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [100])], tipo=TipoActividad.grupal)
        _, [ajenos] = _actividad(db_session, ctx["curso"], [(None, [100])], tipo=TipoActividad.grupal)
        equipo = _equipo(db_session, act, ctx["s1"])
        guardadas = servicio.masivo(act.id, ctx["s1"].id, EMAIL, _valores([ajenos[0], crits[0], crits[0]], [1, 1, 0]))
        assert len(guardadas) == 1
        assert _filas(db_session, equipo_id=equipo.id) == {crits[0].id: 1}


def test_categorias():
    for clase in (EquipoFueraDeActividad, EstudianteFueraDelCurso, CalificacionNoEncontrada):
        assert issubclass(clase, NoEncontrado)
    for clase in (EquipoNoPerteneceAActividad, EstudianteNoPerteneceAlCurso, CriterioFueraDeActividad):
        assert issubclass(clase, SolicitudInvalida)


# ── Independencia de FastAPI ─────────────────────────────────────────────────

def test_no_depende_de_fastapi():
    """El servicio no importa nada de FastAPI ni de Starlette."""
    arbol = ast.parse((Path(__file__).parent.parent / "app/services/calificaciones.py").read_text(encoding="utf-8"))
    importados = set()
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Import):
            importados.update(alias.name for alias in nodo.names)
        elif isinstance(nodo, ast.ImportFrom) and nodo.module:
            importados.add(nodo.module)
    raices = {nombre.split(".")[0] for nombre in importados}
    assert not raices & {"fastapi", "starlette"}
