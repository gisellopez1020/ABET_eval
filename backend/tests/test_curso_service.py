"""
CursoService (services/cursos.py) probado sin HTTP: se llama al servicio con una
sesión SQLite y se verifica que lanza el error de negocio correcto, no un código de estado.
"""
import ast
from datetime import datetime
from pathlib import Path

import pytest

from app.models import Curso, EquipoTrabajo, RaAbetCatalogo, Seccion
from app.models.actividad import TipoActividad
from app.services.cursos import CursoService
from app.services.errores import (
    CursoConCriteriosAbet, CursoNoEncontrado, DatosInvalidos, RaAbetDesconocidos, SinPermiso,
)
from tests.test_catalogo_ra_abet import MOCK_USER, _crear_curso, db_session  # noqa: F401 (fixtures)
from tests.test_reportes import _actividad, _calificar, _estudiante

EMAIL = MOCK_USER["email"]
OTRO = "otro@uao.edu.co"
CURSO = {"nombre": "Redes", "codigo": "R-1", "periodo": "2026-2"}


@pytest.fixture()
def servicio(db_session):
    return CursoService(db_session)


@pytest.fixture()
def catalogo(db_session):
    """RA 2.1 con su Criterio 2.1.1."""
    db_session.add(RaAbetCatalogo(codigo="2.1", competencia="Diseño", descripcion="RA 2.1"))
    db_session.flush()
    db_session.add(RaAbetCatalogo(
        codigo="2.1.1", competencia="Diseño", descripcion="Criterio 2.1.1", codigo_padre="2.1", peso=1,
    ))
    db_session.commit()


@pytest.fixture()
def curso(db_session):
    return _crear_curso(db_session, [])


@pytest.fixture()
def ajeno(db_session):
    return _crear_curso(db_session, [], email=OTRO)


# ── Propiedad: 404 y 403 en todas las operaciones con id ─────────────────────

OPERACIONES = {
    "obtener": lambda s, cid: s.obtener(cid, EMAIL),
    "editar": lambda s, cid: s.editar(cid, EMAIL, {"nombre": "Otro"}),
    "archivar": lambda s, cid: s.archivar(cid, EMAIL),
    "activar": lambda s, cid: s.activar(cid, EMAIL),
    "actividad_reciente": lambda s, cid: s.actividad_reciente(cid, EMAIL, 10),
}


@pytest.mark.parametrize("operacion", OPERACIONES)
def test_curso_inexistente(servicio, operacion):
    with pytest.raises(CursoNoEncontrado, match="^Curso no encontrado$"):
        OPERACIONES[operacion](servicio, 99999)


@pytest.mark.parametrize("operacion", OPERACIONES)
def test_curso_de_otro_docente(servicio, db_session, ajeno, operacion):
    with pytest.raises(SinPermiso, match="^No tiene permiso para acceder a este curso$"):
        OPERACIONES[operacion](servicio, ajeno.id)
    db_session.expire_all()
    assert (ajeno.nombre, ajeno.activo) == ("Curso", True)


# ── Listar, obtener, archivar y activar ──────────────────────────────────────

def test_listar_solo_los_del_docente(servicio, curso, ajeno):
    assert [c.id for c in servicio.listar(EMAIL)] == [curso.id]


def test_obtener(servicio, curso):
    assert servicio.obtener(curso.id, EMAIL) is curso


def test_archivar_y_activar_persisten(servicio, db_session, curso):
    assert servicio.archivar(curso.id, EMAIL).activo is False
    db_session.rollback()  # el servicio ya hizo commit: rollback no lo deshace
    assert db_session.get(Curso, curso.id).activo is False
    assert servicio.activar(curso.id, EMAIL).activo is True
    assert servicio.activar(curso.id, EMAIL).activo is True  # idempotente


# ── Crear y editar: validación de ra_abet ────────────────────────────────────

class TestRaAbet:
    def test_crear_con_resultados_de_aprendizaje(self, servicio, db_session, catalogo):
        curso = servicio.crear(EMAIL, {**CURSO, "ra_abet": ["2.1"]})
        db_session.rollback()
        assert db_session.get(Curso, curso.id).ra_abet == ["2.1"]
        assert curso.docente_email == EMAIL

    def test_crear_con_codigos_desconocidos(self, servicio, db_session, catalogo):
        with pytest.raises(RaAbetDesconocidos) as exc:
            servicio.crear(EMAIL, {**CURSO, "ra_abet": ["2.1", "9.9", "8.8"]})
        assert exc.value.codigos == ["9.9", "8.8"]
        assert str(exc.value) == "Códigos RA ABET que no existen en el catálogo: 9.9, 8.8"
        assert db_session.query(Curso).count() == 0

    def test_crear_con_codigo_de_criterio(self, servicio, db_session, catalogo):
        with pytest.raises(CursoConCriteriosAbet) as exc:
            servicio.crear(EMAIL, {**CURSO, "ra_abet": ["2.1", "2.1.1"]})
        assert exc.value.codigos == ["2.1.1"]
        assert str(exc.value) == "Un curso solo puede tener Resultados de Aprendizaje, no Criterios: 2.1.1"
        assert db_session.query(Curso).count() == 0

    def test_editar_con_codigos_desconocidos_no_cambia_nada(self, servicio, db_session, curso):
        with pytest.raises(RaAbetDesconocidos):
            servicio.editar(curso.id, EMAIL, {"nombre": "X", "ra_abet": ["9.9"]})
        db_session.expire_all()
        assert (curso.nombre, curso.ra_abet) == ("Curso", [])

    def test_editar_con_codigo_de_criterio(self, servicio, catalogo, curso):
        with pytest.raises(CursoConCriteriosAbet):
            servicio.editar(curso.id, EMAIL, {"ra_abet": ["2.1.1"]})

    def test_editar_sin_ra_abet_conserva_valores_antiguos(self, servicio, db_session):
        curso = _crear_curso(db_session, ["RA1: fuera del catálogo"])
        editado = servicio.editar(curso.id, EMAIL, {"nombre": "Renombrado"})
        assert (editado.nombre, editado.ra_abet) == ("Renombrado", ["RA1: fuera del catálogo"])

    def test_ambos_errores_son_datos_invalidos(self):
        assert issubclass(RaAbetDesconocidos, DatosInvalidos)
        assert issubclass(CursoConCriteriosAbet, DatosInvalidos)


# ── Actividad reciente ───────────────────────────────────────────────────────

def test_actividad_reciente_ensambla_estudiantes_y_equipos(servicio, db_session):
    curso = _crear_curso(db_session, [])
    db_session.add(Seccion(nombre="S1", curso_id=curso.id))
    db_session.commit()
    ana = _estudiante(db_session, curso, "ANA")

    individual, [crits_ind] = _actividad(db_session, curso, [(None, [100])])
    _calificar(db_session, crits_ind, [1], estudiante=ana)

    grupal, [crits_grp] = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
    equipo = EquipoTrabajo(nombre="Los Rápidos", actividad_id=grupal.id, seccion_id=ana.seccion_id)
    db_session.add(equipo)
    db_session.commit()
    _calificar(db_session, crits_grp, [1], equipo=equipo)

    items = servicio.actividad_reciente(curso.id, EMAIL, 10)
    assert {(i.actividad_id, i.tipo, i.nombre) for i in items} == {
        (individual.id, "estudiante", "ANA"),
        (grupal.id, "equipo", "Los Rápidos"),
    }
    assert all(isinstance(i.updated_at, datetime) for i in items)


# ── Independencia de FastAPI ─────────────────────────────────────────────────

def test_no_depende_de_fastapi():
    """El servicio no importa nada de FastAPI ni de Starlette."""
    arbol = ast.parse((Path(__file__).parent.parent / "app/services/cursos.py").read_text(encoding="utf-8"))
    importados = set()
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Import):
            importados.update(alias.name for alias in nodo.names)
        elif isinstance(nodo, ast.ImportFrom) and nodo.module:
            importados.add(nodo.module)
    raices = {nombre.split(".")[0] for nombre in importados}
    assert not raices & {"fastapi", "starlette"}
