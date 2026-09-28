"""
Actividad reciente del curso: últimos guardados de calificaciones agrupados por
(actividad, equipo o estudiante), del más reciente al más antiguo.

Reutiliza las fixtures y utilidades de test_reportes (SQLite en memoria).
"""
from datetime import datetime, timedelta, timezone

from app.models import Calificacion, Curso, EquipoTrabajo
from app.models.actividad import TipoActividad
from tests.test_catalogo_ra_abet import MOCK_USER, client, db_session  # noqa: F401 (fixtures)
from tests.test_reportes import _actividad, _calificar, _estudiante, _seccion, curso  # noqa: F401

BASE = datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc)


def _url(curso_id, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"/cursos/{curso_id}/actividad-reciente" + (f"?{query}" if query else "")


def _fechar(db_session, criterios, minutos, estudiante=None, equipo=None):
    """Fija updated_at de las calificaciones de una fuente en BASE + minutos."""
    filtro = (
        Calificacion.equipo_id == equipo.id if equipo else Calificacion.estudiante_id == estudiante.id
    )
    for cal in db_session.query(Calificacion).filter(
        filtro, Calificacion.criterio_id.in_([c.id for c in criterios])
    ):
        cal.updated_at = BASE + timedelta(minutes=minutos)
    db_session.commit()


def _renombrar(db_session, actividad, nombre):
    actividad.nombre = nombre
    db_session.commit()


def test_sin_calificaciones_devuelve_lista_vacia(client, curso):
    resp = client.get(_url(curso.id))
    assert resp.status_code == 200
    assert resp.json() == []


def test_un_guardado_de_varios_criterios_es_un_solo_item(client, db_session, curso):
    act, [crits] = _actividad(db_session, curso, [("2.1.1", [40, 30, 30])])
    _renombrar(db_session, act, "Taller 1")
    ana = _estudiante(db_session, curso, "Ana")
    _calificar(db_session, crits, [1, 0, 1], estudiante=ana)

    datos = client.get(_url(curso.id)).json()
    assert len(datos) == 1
    assert datos[0]["actividad_id"] == act.id
    assert datos[0]["actividad_nombre"] == "Taller 1"
    assert datos[0]["tipo"] == "estudiante"
    assert datos[0]["nombre"] == "Ana"
    assert datos[0]["updated_at"]


def test_equipo_y_orden_descendente(client, db_session, curso):
    ind, [crits_ind] = _actividad(db_session, curso, [("2.1.1", [100])])
    _renombrar(db_session, ind, "Quiz")
    grp, [crits_grp] = _actividad(db_session, curso, [("4.1.1", [100])], tipo=TipoActividad.grupal)
    _renombrar(db_session, grp, "Proyecto")
    ana = _estudiante(db_session, curso, "Ana")
    beto = _estudiante(db_session, curso, "Beto")
    equipo = EquipoTrabajo(nombre="Los Routers", actividad_id=grp.id, seccion_id=_seccion(db_session, curso).id)
    db_session.add(equipo)
    db_session.commit()

    _calificar(db_session, crits_ind, [1], estudiante=ana)
    _calificar(db_session, crits_ind, [0], estudiante=beto)
    _calificar(db_session, crits_grp, [1], equipo=equipo)
    _fechar(db_session, crits_ind, 10, estudiante=ana)
    _fechar(db_session, crits_ind, 30, estudiante=beto)
    _fechar(db_session, crits_grp, 20, equipo=equipo)

    datos = client.get(_url(curso.id)).json()
    assert [(d["nombre"], d["actividad_nombre"], d["tipo"]) for d in datos] == [
        ("Beto", "Quiz", "estudiante"),
        ("Los Routers", "Proyecto", "equipo"),
        ("Ana", "Quiz", "estudiante"),
    ]


def test_edicion_parcial_usa_el_updated_at_mas_reciente(client, db_session, curso):
    _, [crits] = _actividad(db_session, curso, [("2.1.1", [50, 50])])
    ana = _estudiante(db_session, curso, "Ana")
    beto = _estudiante(db_session, curso, "Beto")
    _calificar(db_session, crits, [1, 1], estudiante=ana)
    _calificar(db_session, crits, [1, 1], estudiante=beto)
    _fechar(db_session, crits, 0, estudiante=ana)
    _fechar(db_session, crits, 10, estudiante=beto)
    # Ana edita un solo criterio después que Beto: pasa a ser la más reciente
    _fechar(db_session, crits[:1], 20, estudiante=ana)

    datos = client.get(_url(curso.id)).json()
    assert [d["nombre"] for d in datos] == ["Ana", "Beto"]


def test_limit(client, db_session, curso):
    _, [crits] = _actividad(db_session, curso, [("2.1.1", [100])])
    for i in range(5):
        est = _estudiante(db_session, curso, f"E{i}")
        _calificar(db_session, crits, [1], estudiante=est)
        _fechar(db_session, crits, i, estudiante=est)

    datos = client.get(_url(curso.id, limit=2)).json()
    assert [d["nombre"] for d in datos] == ["E4", "E3"]
    assert len(client.get(_url(curso.id)).json()) == 5


def test_limit_fuera_de_rango(client, curso):
    assert client.get(_url(curso.id, limit=0)).status_code == 422
    assert client.get(_url(curso.id, limit=51)).status_code == 422


def test_no_incluye_calificaciones_de_otros_cursos(client, db_session, curso):
    otro = Curso(nombre="Otro", codigo="O-1", periodo="2026-2", docente_email=MOCK_USER["email"], ra_abet=[])
    db_session.add(otro)
    db_session.commit()
    _, [crits] = _actividad(db_session, curso, [("2.1.1", [100])])
    _calificar(db_session, crits, [1], estudiante=_estudiante(db_session, curso, "Ana"))

    assert client.get(_url(otro.id)).json() == []


def test_curso_de_otro_docente_403(client, db_session):
    ajeno = Curso(nombre="Ajeno", codigo="A-1", periodo="2026-2", docente_email="otro@uao.edu.co", ra_abet=[])
    db_session.add(ajeno)
    db_session.commit()
    assert client.get(_url(ajeno.id)).status_code == 403


def test_curso_inexistente_404(client):
    assert client.get(_url(99999)).status_code == 404
