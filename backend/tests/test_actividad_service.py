"""
ActividadService (services/actividades.py) probado sin HTTP: se llama al servicio con
una sesión SQLite y se verifica el error de negocio que lanza o lo que devuelve.
"""
import ast
from decimal import Decimal
from pathlib import Path

import pytest

from pydantic import ValidationError

from app.models import Actividad, EquipoTrabajo, Seccion
from app.models.actividad import TipoActividad
from app.schemas.actividad import ActividadCreate, ActividadDetalleOut, ActividadUpdate
from app.services.actividades import ActividadService
from app.services.errores import (
    ActividadConCalificaciones, ActividadNoEncontrada, Conflicto, CursoNoEncontrado, DatosInvalidos,
    SeccionConTrabajoEnActividad, SeccionesFueraDelCurso, SinPermiso,
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


# ── Alcance de secciones: crear ──────────────────────────────────────────────

def _crear(servicio, curso, **alcance):
    """Crea pasando por el schema, como el router (que valida y quita repetidos)."""
    return servicio.crear(curso.id, EMAIL, ActividadCreate(**NUEVA, **alcance).model_dump())


@pytest.fixture()
def tres(db_session):
    """Curso con S1, S2 y S3."""
    return _curso(db_session, "Redes", "R-2", secciones=("S1", "S2", "S3"))


class TestCrearConAlcance:
    def test_sin_especificar_aplica_a_todas_incluso_a_una_seccion_nueva(self, servicio, db_session, tres):
        curso, [s1, _, _] = tres
        actividad = _crear(servicio, curso)
        nueva = Seccion(nombre="S4", curso_id=curso.id)
        db_session.add(nueva)
        db_session.commit()
        assert (actividad.aplica_todas_secciones, actividad.secciones_ids) == (True, [])
        assert actividad.aplica_en(s1.id) and actividad.aplica_en(nueva.id)

    def test_con_secciones_especificas(self, servicio, db_session, tres):
        curso, [s1, s2, s3] = tres
        actividad = _crear(servicio, curso, aplica_todas_secciones=False, secciones_ids=[s3.id, s1.id, s3.id])
        db_session.expire_all()
        guardada = db_session.get(Actividad, actividad.id)
        assert (guardada.aplica_todas_secciones, guardada.secciones_ids) == (False, [s1.id, s3.id])
        assert [guardada.aplica_en(s.id) for s in (s1, s2, s3)] == [True, False, True]

    @pytest.mark.parametrize("cual", ["inexistente", "de_otro_curso"])
    def test_seccion_fuera_del_curso_no_crea_nada(self, servicio, db_session, tres, cual):
        curso, [s1, _, _] = tres
        _, [ajena] = _curso(db_session, "Otro", "O-1")
        fuera = 99999 if cual == "inexistente" else ajena.id
        with pytest.raises(SeccionesFueraDelCurso) as exc:
            _crear(servicio, curso, aplica_todas_secciones=False, secciones_ids=[s1.id, fuera])
        assert exc.value.seccion_ids == [fuera]
        assert str(exc.value) == f"Secciones que no son de este curso: {fuera}"
        assert isinstance(exc.value, DatosInvalidos)
        assert db_session.query(Actividad).count() == 0


class TestSchemaAlcance:
    """'Todas' y 'específicas' son estados distintos: una lista vacía no significa 'todas'."""

    def test_especificas_sin_secciones(self):
        with pytest.raises(ValidationError, match="Elija al menos una sección"):
            ActividadCreate(**NUEVA, aplica_todas_secciones=False, secciones_ids=[])

    def test_todas_con_secciones(self):
        with pytest.raises(ValidationError, match="solo se envía con aplica_todas_secciones en false"):
            ActividadCreate(**NUEVA, secciones_ids=[1])

    @pytest.mark.parametrize("cuerpo", [{"secciones_ids": [1]}, {"aplica_todas_secciones": False}])
    def test_editar_exige_el_alcance_completo(self, cuerpo):
        with pytest.raises(ValidationError):
            ActividadUpdate(**cuerpo)

    def test_editar_sin_alcance_no_lo_toca(self):
        assert ActividadUpdate(nombre="X").model_dump(exclude_none=True) == {"nombre": "X"}


# ── Alcance de secciones: editar ─────────────────────────────────────────────

def _alcance(servicio, actividad, *secciones):
    """Edita el alcance como el router: sin secciones es 'todas'."""
    cuerpo = {"aplica_todas_secciones": not secciones, "secciones_ids": [s.id for s in secciones] or None}
    return servicio.editar(actividad.id, EMAIL, ActividadUpdate(**cuerpo).model_dump(exclude_none=True))


class TestEditarAlcance:
    def test_ampliar_y_volver_a_todas(self, servicio, tres):
        curso, [s1, s2, _] = tres
        actividad = _crear(servicio, curso, aplica_todas_secciones=False, secciones_ids=[s1.id])
        assert _alcance(servicio, actividad, s1, s2).secciones_ids == [s1.id, s2.id]
        editada = _alcance(servicio, actividad)
        assert (editada.aplica_todas_secciones, editada.secciones_ids) == (True, [])

    def test_quitar_una_seccion_sin_trabajo(self, servicio, tres):
        curso, [_, s2, _] = tres
        actividad = _crear(servicio, curso)
        editada = _alcance(servicio, actividad, s2)
        assert (editada.aplica_todas_secciones, editada.secciones_ids) == (False, [s2.id])

    def test_editar_otros_campos_conserva_el_alcance(self, servicio, tres):
        curso, [s1, _, _] = tres
        actividad = _crear(servicio, curso, aplica_todas_secciones=False, secciones_ids=[s1.id])
        assert servicio.editar(actividad.id, EMAIL, {"nombre": "Otro"}).secciones_ids == [s1.id]

    def test_seccion_de_otro_curso(self, servicio, db_session, tres):
        curso, _ = tres
        _, [ajena] = _curso(db_session, "Otro", "O-1")
        actividad = _crear(servicio, curso)
        with pytest.raises(SeccionesFueraDelCurso):
            _alcance(servicio, actividad, ajena)

    @pytest.mark.parametrize("trabajo,mensaje", [
        ("equipo_sin_calificar", "equipos en esa actividad. Elimínelos primero."),
        ("equipo_calificado", "calificaciones registradas en esa actividad."),
        ("calificacion_individual", "calificaciones registradas en esa actividad."),
    ])
    def test_quitar_una_seccion_con_trabajo_es_conflicto_y_no_cambia(
        self, servicio, db_session, tres, trabajo, mensaje,
    ):
        """Con calificaciones el mensaje no pide eliminarlas: no hay forma de hacerlo."""
        curso, [s1, s2, _] = tres
        if trabajo.startswith("equipo"):
            actividad, [criterios] = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
            equipo = EquipoTrabajo(nombre="E1", actividad_id=actividad.id, seccion_id=s1.id)
            db_session.add(equipo)
            db_session.commit()
            if trabajo == "equipo_calificado":
                _calificar(db_session, criterios, [1], equipo=equipo)
        else:
            actividad, [criterios] = _actividad(db_session, curso, [(None, [100])])
            _calificar(db_session, criterios, [1], estudiante=_est(db_session, s1, "Ana", "1"))
        with pytest.raises(SeccionConTrabajoEnActividad) as exc:
            _alcance(servicio, actividad, s2)
        assert str(exc.value) == f"No se puede quitar la sección 'S1' de 'Act' porque ya tiene {mensaje}"
        assert exc.value.con_calificaciones is (trabajo != "equipo_sin_calificar")
        assert isinstance(exc.value, Conflicto)
        db_session.expire_all()
        assert db_session.get(Actividad, actividad.id).aplica_todas_secciones is True
        # Ampliar, o conservar la sección con trabajo, sí se puede
        assert _alcance(servicio, actividad, s1, s2).secciones_ids == [s1.id, s2.id]

    def test_trabajo_en_otra_actividad_no_bloquea(self, servicio, db_session, tres):
        curso, [s1, s2, _] = tres
        _, [criterios] = _actividad(db_session, curso, [(None, [100])])
        _calificar(db_session, criterios, [1], estudiante=_est(db_session, s1, "Ana", "1"))
        actividad = _crear(servicio, curso)
        assert _alcance(servicio, actividad, s2).secciones_ids == [s2.id]


def test_borrar_la_unica_seccion_especifica_no_abre_la_actividad_a_todas(servicio, db_session, tres):
    """Sin filas en actividad_secciones y con aplica_todas_secciones en False: no aplica a ninguna."""
    curso, [s1, s2, _] = tres
    actividad = _crear(servicio, curso, aplica_todas_secciones=False, secciones_ids=[s1.id])
    db_session.delete(db_session.get(Seccion, s1.id))
    db_session.commit()
    db_session.expire_all()
    guardada = db_session.get(Actividad, actividad.id)
    assert (guardada.aplica_todas_secciones, guardada.secciones_ids) == (False, [])
    assert not guardada.aplica_en(s2.id)


def test_listar_y_obtener_exponen_el_alcance(servicio, tres):
    curso, [s1, _, _] = tres
    todas = _crear(servicio, curso)
    especifica = _crear(servicio, curso, aplica_todas_secciones=False, secciones_ids=[s1.id])
    alcance = {a.id: (a.aplica_todas_secciones, a.secciones_ids) for a in servicio.listar(curso.id, EMAIL)}
    assert alcance == {todas.id: (True, []), especifica.id: (False, [s1.id])}
    assert servicio.obtener(especifica.id, EMAIL).secciones_ids == [s1.id]


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


def test_calificaciones_de_equipos_de_otra_seccion_no_bloquean(servicio, db_session, tres):
    """Las calificaciones de un equipo cuentan solo en la sección de ese equipo."""
    curso, [s1, s2, _] = tres
    actividad, [criterios] = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
    equipo = EquipoTrabajo(nombre="E2", actividad_id=actividad.id, seccion_id=s2.id)
    db_session.add(equipo)
    db_session.commit()
    _calificar(db_session, criterios, [1], equipo=equipo)
    assert _alcance(servicio, actividad, s2).secciones_ids == [s2.id]
