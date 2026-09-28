"""
Lectura de las calificaciones guardadas de un equipo o de un estudiante en una
actividad (pantallas Evaluación y Calificar): qué criterios tiene calificados y con qué valor.

Reutiliza las fixtures y utilidades de test_reportes (SQLite en memoria).
"""
from app.models import Curso, EquipoTrabajo, Seccion
from app.models.actividad import TipoActividad
from tests.test_catalogo_ra_abet import MOCK_USER, client, db_session  # noqa: F401 (fixtures)
from tests.test_reportes import _actividad, _calificar, _estudiante, _seccion, curso  # noqa: F401


def _equipo(db_session, curso, actividad, nombre="E1"):
    equipo = EquipoTrabajo(nombre=nombre, actividad_id=actividad.id, seccion_id=_seccion(db_session, curso).id)
    db_session.add(equipo)
    db_session.commit()
    return equipo


def _url(actividad, equipo):
    return f"/actividades/{actividad.id}/equipos/{equipo.id}/calificaciones"


def _url_est(actividad, estudiante):
    return f"/actividades/{actividad.id}/estudiantes/{estudiante.id}/calificaciones"


def _curso_ajeno(db_session):
    ajeno = Curso(nombre="Ajeno", codigo="A-1", periodo="2026-2", docente_email="otro@uao.edu.co", ra_abet=[])
    db_session.add(ajeno)
    db_session.flush()
    db_session.add(Seccion(nombre="S1", curso_id=ajeno.id))
    db_session.commit()
    return ajeno


def test_sin_calificaciones_devuelve_lista_vacia(client, db_session, curso):
    act, _ = _actividad(db_session, curso, [(None, [50, 50])], tipo=TipoActividad.grupal)
    equipo = _equipo(db_session, curso, act)
    resp = client.get(_url(act, equipo))
    assert resp.status_code == 200
    assert resp.json() == []


def test_devuelve_solo_las_del_equipo_y_la_actividad(client, db_session, curso):
    act, [crits] = _actividad(db_session, curso, [(None, [40, 30, 30])], tipo=TipoActividad.grupal)
    _, [otros_crits] = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
    equipo = _equipo(db_session, curso, act)
    vecino = _equipo(db_session, curso, act, "E2")
    _calificar(db_session, crits[:2], [1, 0], equipo=equipo)
    _calificar(db_session, crits, [1, 1, 1], equipo=vecino)
    # Fila huérfana: calificación del equipo sobre un criterio de otra actividad
    _calificar(db_session, otros_crits, [1], equipo=equipo)

    datos = client.get(_url(act, equipo)).json()
    assert sorted((d["criterio_id"], d["valor"]) for d in datos) == [(crits[0].id, 1), (crits[1].id, 0)]
    assert all(d["equipo_id"] == equipo.id for d in datos)


def test_equipo_de_otra_actividad_404(client, db_session, curso):
    act, _ = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
    otra, _ = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
    equipo = _equipo(db_session, curso, otra)
    assert client.get(_url(act, equipo)).status_code == 404


def test_actividad_de_otro_docente_403(client, db_session):
    ajeno = _curso_ajeno(db_session)
    act, _ = _actividad(db_session, ajeno, [(None, [100])], tipo=TipoActividad.grupal)
    equipo = _equipo(db_session, ajeno, act)
    assert client.get(_url(act, equipo)).status_code == 403


def test_actividad_inexistente_404(client):
    assert client.get("/actividades/99999/equipos/1/calificaciones").status_code == 404


# ---------- Estudiante ----------

def test_estudiante_sin_calificaciones_devuelve_lista_vacia(client, db_session, curso):
    act, _ = _actividad(db_session, curso, [(None, [50, 50])])
    ana = _estudiante(db_session, curso, "Ana")
    resp = client.get(_url_est(act, ana))
    assert resp.status_code == 200
    assert resp.json() == []


def test_estudiante_devuelve_solo_las_suyas_de_la_actividad(client, db_session, curso):
    act, [crits] = _actividad(db_session, curso, [(None, [40, 30, 30])])
    _, [otros_crits] = _actividad(db_session, curso, [(None, [100])])
    grp, [crits_grp] = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
    ana = _estudiante(db_session, curso, "Ana")
    beto = _estudiante(db_session, curso, "Beto")
    _calificar(db_session, crits[:2], [1, 0], estudiante=ana)
    _calificar(db_session, crits, [1, 1, 1], estudiante=beto)
    _calificar(db_session, otros_crits, [1], estudiante=ana)
    # La calificación de su equipo no es individual: no aparece
    equipo = _equipo(db_session, curso, grp)
    _calificar(db_session, crits_grp, [1], equipo=equipo)

    datos = client.get(_url_est(act, ana)).json()
    assert sorted((d["criterio_id"], d["valor"]) for d in datos) == [(crits[0].id, 1), (crits[1].id, 0)]
    assert all(d["estudiante_id"] == ana.id and d["equipo_id"] is None for d in datos)


def test_estudiante_de_otro_curso_404(client, db_session, curso):
    otro = Curso(nombre="Otro", codigo="O-1", periodo="2026-2", docente_email=MOCK_USER["email"], ra_abet=[])
    db_session.add(otro)
    db_session.flush()
    db_session.add(Seccion(nombre="S1", curso_id=otro.id))
    db_session.commit()
    act, _ = _actividad(db_session, curso, [(None, [100])])
    extranjero = _estudiante(db_session, otro, "Zoe")
    assert client.get(_url_est(act, extranjero)).status_code == 404


def test_estudiante_inexistente_404(client, db_session, curso):
    act, _ = _actividad(db_session, curso, [(None, [100])])
    assert client.get(f"/actividades/{act.id}/estudiantes/99999/calificaciones").status_code == 404


def test_estudiante_actividad_de_otro_docente_403(client, db_session):
    ajeno = _curso_ajeno(db_session)
    act, _ = _actividad(db_session, ajeno, [(None, [100])])
    zoe = _estudiante(db_session, ajeno, "Zoe")
    assert client.get(_url_est(act, zoe)).status_code == 403


def test_estudiante_actividad_inexistente_404(client):
    assert client.get("/actividades/99999/estudiantes/1/calificaciones").status_code == 404
