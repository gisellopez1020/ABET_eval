"""
Mensajes exactos de los errores de routers/equipos.py vistos por HTTP: lo que
test_equipos solo comprueba por código o por subcadena. test_equipos.py (incluidos los
tests del estudiante repetido en el mismo equipo) no se modifica.

Reutiliza las fixtures de test_equipos y test_reportes (SQLite en memoria).
"""
import pytest

from app.models import EquipoTrabajo, MiembroEquipo
from app.models.actividad import TipoActividad
from tests.test_calificaciones_lectura import _curso_ajeno
from tests.test_catalogo_ra_abet import client, db_session  # noqa: F401 (fixtures)
from tests.test_equipos import _crear, _url, alumnos, grupal  # noqa: F401 (fixtures)
from tests.test_reportes import _actividad, _estudiante, _seccion, curso  # noqa: F401


def _detalle(resp):
    return resp.status_code, resp.json()["detail"]


def _equipos(db_session, actividad):
    return db_session.query(EquipoTrabajo).filter_by(actividad_id=actividad.id).count()


# (método, ruta, kwargs) de los 3 endpoints que reciben actividad y sección
POR_ACTIVIDAD_Y_SECCION = [
    ("get", "/actividades/{a}/secciones/{s}/equipos", {}),
    ("post", "/actividades/{a}/secciones/{s}/equipos", {"json": {"equipos": []}}),
    ("get", "/actividades/{a}/modo-calificacion/{s}", {}),
]
IDS = ["listar", "crear", "modo-calificacion"]


@pytest.mark.parametrize("metodo,ruta,kwargs", POR_ACTIVIDAD_Y_SECCION, ids=IDS)
def test_actividad_inexistente_404(client, db_session, curso, metodo, ruta, kwargs):
    resp = getattr(client, metodo)(ruta.format(a=99999, s=_seccion(db_session, curso).id), **kwargs)
    assert _detalle(resp) == (404, "Actividad no encontrada")


@pytest.mark.parametrize("metodo,ruta,kwargs", POR_ACTIVIDAD_Y_SECCION, ids=IDS)
def test_actividad_de_otro_docente_403(client, db_session, metodo, ruta, kwargs):
    ajeno = _curso_ajeno(db_session)
    act, _ = _actividad(db_session, ajeno, [(None, [100])], tipo=TipoActividad.grupal)
    resp = getattr(client, metodo)(ruta.format(a=act.id, s=_seccion(db_session, ajeno).id), **kwargs)
    assert _detalle(resp) == (403, "No tiene permiso sobre esta actividad")


@pytest.mark.parametrize("metodo,ruta,kwargs", POR_ACTIVIDAD_Y_SECCION, ids=IDS)
def test_seccion_de_otro_curso_404(client, db_session, curso, grupal, metodo, ruta, kwargs):
    act, _ = grupal
    ajena = _seccion(db_session, _curso_ajeno(db_session))
    resp = getattr(client, metodo)(ruta.format(a=act.id, s=ajena.id), **kwargs)
    assert _detalle(resp) == (404, "Sección no encontrada en este curso")


# ── Crear ────────────────────────────────────────────────────────────────────

class TestCrear:
    def test_actividad_individual(self, client, db_session, curso, alumnos):
        act, _ = _actividad(db_session, curso, [(None, [100])])
        resp = _crear(client, act, _seccion(db_session, curso), ("E1", alumnos[:1]))
        assert _detalle(resp) == (400, "Solo se pueden crear equipos para actividades de tipo grupal")

    def test_estudiante_de_otra_seccion_y_nada_creado(self, client, db_session, curso, grupal, alumnos):
        act, _ = grupal
        s1 = _seccion(db_session, curso)
        de_s2 = _estudiante(db_session, curso, "Dani", seccion="S2")
        resp = _crear(client, act, s1, ("E1", alumnos[:1]), ("E2", [de_s2]))
        assert _detalle(resp) == (400, f"Estudiante {de_s2.id} no pertenece a la sección {s1.id}")
        assert _equipos(db_session, act) == 0

    def test_estudiante_inexistente(self, client, db_session, curso, grupal):
        act, _ = grupal
        s1 = _seccion(db_session, curso)
        resp = client.post(_url(act, s1), json={"equipos": [{"nombre": "E1", "estudiante_ids": [99999]}]})
        assert _detalle(resp) == (400, f"Estudiante 99999 no pertenece a la sección {s1.id}")

    def test_estudiante_repetido_mensaje_y_nada_creado(self, client, db_session, curso, grupal, alumnos):
        act, _ = grupal
        ana = alumnos[0]
        resp = client.post(
            _url(act, _seccion(db_session, curso)),
            json={"equipos": [{"nombre": "E1", "estudiante_ids": [ana.id, ana.id]}]},
        )
        assert _detalle(resp) == (400, "El estudiante Ana está repetido en el equipo 'E1'")
        assert _equipos(db_session, act) == 0


# ── Editar ───────────────────────────────────────────────────────────────────

class TestEditar:
    @pytest.fixture()
    def equipo(self, client, db_session, curso, grupal, alumnos):
        act, _ = grupal
        [e1] = _crear(client, act, _seccion(db_session, curso), ("E1", alumnos[:2])).json()
        return e1

    def _miembros(self, db_session, equipo_id):
        filas = db_session.query(MiembroEquipo.estudiante_id).filter_by(equipo_id=equipo_id).all()
        return sorted(eid for (eid,) in filas)

    def test_inexistente(self, client):
        assert _detalle(client.put("/equipos/99999", json={"nombre": "X"})) == (404, "Equipo no encontrado")

    def test_de_otro_docente_sin_cambios(self, client, db_session):
        ajeno = _curso_ajeno(db_session)
        act, _ = _actividad(db_session, ajeno, [(None, [100])], tipo=TipoActividad.grupal)
        equipo = EquipoTrabajo(nombre="Ajeno", actividad_id=act.id, seccion_id=_seccion(db_session, ajeno).id)
        db_session.add(equipo)
        db_session.commit()
        resp = client.put(f"/equipos/{equipo.id}", json={"nombre": "Mío"})
        assert _detalle(resp) == (403, "No tiene permiso sobre este equipo")
        db_session.expire_all()
        assert db_session.get(EquipoTrabajo, equipo.id).nombre == "Ajeno"

    def test_estudiante_de_otra_seccion(self, client, db_session, curso, equipo):
        de_s2 = _estudiante(db_session, curso, "Dani", seccion="S2")
        resp = client.put(f"/equipos/{equipo['id']}", json={"estudiante_ids": [de_s2.id]})
        assert _detalle(resp) == (400, f"Estudiante {de_s2.id} no pertenece a la sección del equipo")

    def test_repetido_al_renombrar_usa_el_nombre_nuevo(self, client, db_session, equipo, alumnos):
        """El nombre se asigna antes de validar los integrantes: el mensaje ya lo usa."""
        ana = alumnos[0]
        antes = self._miembros(db_session, equipo["id"])
        resp = client.put(f"/equipos/{equipo['id']}", json={"nombre": "Nuevo", "estudiante_ids": [ana.id, ana.id]})
        assert _detalle(resp) == (400, "El estudiante Ana está repetido en el equipo 'Nuevo'")
        assert self._miembros(db_session, equipo["id"]) == antes
