"""
Mensajes exactos de los errores de routers/calificaciones.py vistos por HTTP, y que un
guardado con un criterio inválido no deja nada guardado. Lo que test_calificaciones_escritura
y test_calificaciones_lectura solo comprueban por código o por subcadena; esos dos archivos
(incluidos los tests de la calificación masiva sin duplicados) no se modifican.

Reutiliza las fixtures de test_reportes (SQLite en memoria).
"""
import pytest

from app.models import Calificacion
from app.models.actividad import TipoActividad
from tests.test_calificaciones_lectura import _curso_ajeno, _equipo
from tests.test_catalogo_ra_abet import client, db_session  # noqa: F401 (fixtures)
from tests.test_reportes import _actividad, _calificar, _estudiante, _seccion, curso  # noqa: F401


def _detalle(resp):
    return resp.status_code, resp.json()["detail"]


def _pedir(client, endpoint, actividad_id, seccion_id, estudiante_id):
    """Una petición mínima a cada endpoint que recibe la actividad."""
    if endpoint == "resumen":
        return client.get(f"/actividades/{actividad_id}/calificaciones/{seccion_id}")
    if endpoint == "equipo":
        return client.get(f"/actividades/{actividad_id}/equipos/1/calificaciones")
    if endpoint == "estudiante":
        return client.get(f"/actividades/{actividad_id}/estudiantes/{estudiante_id}/calificaciones")
    if endpoint == "guardar":
        return client.post("/calificaciones", json={
            "actividad_id": actividad_id, "estudiante_id": estudiante_id, "criterios": [],
        })
    return client.post(f"/actividades/{actividad_id}/calificaciones/masivo",
                       json={"seccion_id": seccion_id, "criterios": []})


CON_ACTIVIDAD = ["resumen", "equipo", "estudiante", "guardar", "masivo"]


@pytest.mark.parametrize("endpoint", CON_ACTIVIDAD)
def test_actividad_inexistente_404(client, db_session, curso, endpoint):
    ana = _estudiante(db_session, curso, "Ana")
    resp = _pedir(client, endpoint, 99999, _seccion(db_session, curso).id, ana.id)
    assert _detalle(resp) == (404, "Actividad no encontrada")


@pytest.mark.parametrize("endpoint", CON_ACTIVIDAD)
def test_actividad_de_otro_docente_403_sin_guardar(client, db_session, endpoint):
    ajeno = _curso_ajeno(db_session)
    act, _ = _actividad(db_session, ajeno, [(None, [100])], tipo=TipoActividad.grupal)
    zoe = _estudiante(db_session, ajeno, "Zoe")
    resp = _pedir(client, endpoint, act.id, _seccion(db_session, ajeno).id, zoe.id)
    assert _detalle(resp) == (403, "No tiene permiso sobre esta actividad")
    assert db_session.query(Calificacion).count() == 0


@pytest.mark.parametrize("endpoint", ["resumen", "masivo"])
def test_seccion_de_otro_curso_404(client, db_session, curso, endpoint):
    act, _ = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
    ajena = _seccion(db_session, _curso_ajeno(db_session))
    resp = _pedir(client, endpoint, act.id, ajena.id, None)
    assert _detalle(resp) == (404, "Sección no encontrada en este curso")


# ── Lecturas: el equipo o el estudiante de la URL ────────────────────────────

class TestLecturas:
    @pytest.mark.parametrize("cual", ["de_otra_actividad", "inexistente"])
    def test_equipo_404(self, client, db_session, curso, cual):
        act, _ = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
        otra, _ = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
        equipo_id = _equipo(db_session, curso, otra).id if cual == "de_otra_actividad" else 99999
        resp = client.get(f"/actividades/{act.id}/equipos/{equipo_id}/calificaciones")
        assert _detalle(resp) == (404, "Equipo no encontrado en esta actividad")

    @pytest.mark.parametrize("cual", ["de_otro_curso", "inexistente"])
    def test_estudiante_404(self, client, db_session, curso, cual):
        act, _ = _actividad(db_session, curso, [(None, [100])])
        est_id = _estudiante(db_session, _curso_ajeno(db_session), "Zoe").id if cual == "de_otro_curso" else 99999
        resp = client.get(f"/actividades/{act.id}/estudiantes/{est_id}/calificaciones")
        assert _detalle(resp) == (404, "Estudiante no encontrado en este curso")


# ── Guardar ──────────────────────────────────────────────────────────────────

class TestGuardar:
    def test_estudiante_inexistente(self, client, db_session, curso):
        act, [crits] = _actividad(db_session, curso, [(None, [100])])
        resp = client.post("/calificaciones", json={
            "actividad_id": act.id, "estudiante_id": 99999, "criterios": [{"criterio_id": crits[0].id, "valor": 1}],
        })
        assert _detalle(resp) == (404, "Estudiante no encontrado")

    def test_criterio_de_otra_actividad(self, client, db_session, curso):
        act, _ = _actividad(db_session, curso, [(None, [100])])
        _, [ajenos] = _actividad(db_session, curso, [(None, [100])])
        ana = _estudiante(db_session, curso, "Ana")
        resp = client.post("/calificaciones", json={
            "actividad_id": act.id, "estudiante_id": ana.id, "criterios": [{"criterio_id": ajenos[0].id, "valor": 1}],
        })
        assert _detalle(resp) == (400, f"Criterio {ajenos[0].id} no pertenece a esta actividad")

    def test_un_criterio_invalido_no_deja_guardado_ninguno_de_los_validos(self, client, db_session, curso):
        """
        Dos criterios válidos (el 1.º ya calificado en 0) y uno de otra actividad, al final.
        Al terminar la petición (rollback, como al cerrar la sesión real) no queda nada del
        envío: ni el insertado ni la actualización del que ya existía.
        """
        act, [crits] = _actividad(db_session, curso, [(None, [50, 50])])
        _, [ajenos] = _actividad(db_session, curso, [(None, [100])])
        ana = _estudiante(db_session, curso, "Ana")
        _calificar(db_session, crits[:1], [0], estudiante=ana)

        resp = client.post("/calificaciones", json={"actividad_id": act.id, "estudiante_id": ana.id, "criterios": [
            {"criterio_id": crits[0].id, "valor": 1},
            {"criterio_id": crits[1].id, "valor": 1},
            {"criterio_id": ajenos[0].id, "valor": 1},
        ]})
        assert _detalle(resp) == (400, f"Criterio {ajenos[0].id} no pertenece a esta actividad")

        db_session.rollback()
        filas = db_session.query(Calificacion).filter_by(estudiante_id=ana.id).all()
        assert [(c.criterio_id, c.valor) for c in filas] == [(crits[0].id, 0)]


# ── Editar ───────────────────────────────────────────────────────────────────

class TestEditar:
    def test_inexistente(self, client):
        assert _detalle(client.patch("/calificaciones/99999", json={"valor": 1})) == (404, "Calificación no encontrada")

    def test_de_otro_docente(self, client, db_session):
        ajeno = _curso_ajeno(db_session)
        act, [crits] = _actividad(db_session, ajeno, [(None, [100])])
        _calificar(db_session, crits, [0], estudiante=_estudiante(db_session, ajeno, "Zoe"))
        cal = db_session.query(Calificacion).one()
        resp = client.patch(f"/calificaciones/{cal.id}", json={"valor": 1})
        assert _detalle(resp) == (403, "No tiene permiso sobre esta calificación")
