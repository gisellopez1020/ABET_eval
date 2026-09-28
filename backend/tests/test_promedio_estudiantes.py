"""
Promedio ponderado por estudiante en GET /secciones/{id}/estudiantes: nota de cada
actividad calificada por completo, ponderada por peso_nota_final y renormalizada
sobre las actividades calificadas.

Reutiliza las fixtures y utilidades de test_reportes (SQLite en memoria).
"""
from app.models import Curso, EquipoTrabajo, MiembroEquipo
from app.models.actividad import TipoActividad
from tests.test_catalogo_ra_abet import MOCK_USER, client, db_session  # noqa: F401 (fixtures)
from tests.test_reportes import _actividad, _calificar, _estudiante, _seccion, curso  # noqa: F401


def _promedios(client, db_session, curso):
    resp = client.get(f"/secciones/{_seccion(db_session, curso).id}/estudiantes")
    assert resp.status_code == 200, resp.text
    return {e["nombre_completo"]: e["promedio"] for e in resp.json()}


def _peso(db_session, actividad, peso):
    actividad.peso_nota_final = peso
    db_session.commit()


def test_sin_calificaciones_es_null(client, db_session, curso):
    _actividad(db_session, curso, [(None, [100])])
    _estudiante(db_session, curso, "Ana")
    assert _promedios(client, db_session, curso) == {"Ana": None}


def test_actividad_individual(client, db_session, curso):
    _, [crits] = _actividad(db_session, curso, [(None, [60, 40])])
    ana = _estudiante(db_session, curso, "Ana")
    _calificar(db_session, crits, [1, 0], estudiante=ana)
    assert _promedios(client, db_session, curso) == {"Ana": 3.0}


def test_ponderado_por_peso_nota_final(client, db_session, curso):
    a1, [c1] = _actividad(db_session, curso, [(None, [100])])
    a2, [c2] = _actividad(db_session, curso, [(None, [100])])
    _peso(db_session, a1, 30)
    _peso(db_session, a2, 70)
    ana = _estudiante(db_session, curso, "Ana")
    _calificar(db_session, c1, [1], estudiante=ana)  # 5.0 con peso 30
    _calificar(db_session, c2, [0], estudiante=ana)  # 0.0 con peso 70
    assert _promedios(client, db_session, curso) == {"Ana": 1.5}


def test_renormaliza_sobre_actividades_calificadas(client, db_session, curso):
    a1, [c1] = _actividad(db_session, curso, [(None, [50, 50])])
    a2, _ = _actividad(db_session, curso, [(None, [100])])
    _peso(db_session, a1, 30)
    _peso(db_session, a2, 70)
    ana = _estudiante(db_session, curso, "Ana")
    _calificar(db_session, c1, [1, 1], estudiante=ana)
    # a2 pendiente: no cuenta como 0, el promedio es el de a1
    assert _promedios(client, db_session, curso) == {"Ana": 5.0}


def test_actividad_a_medio_calificar_se_excluye(client, db_session, curso):
    _, [crits] = _actividad(db_session, curso, [(None, [50, 50])])
    ana = _estudiante(db_session, curso, "Ana")
    _calificar(db_session, crits[:1], [1], estudiante=ana)
    assert _promedios(client, db_session, curso) == {"Ana": None}


def test_actividad_grupal_cuenta_para_cada_miembro(client, db_session, curso):
    grp, [crits] = _actividad(db_session, curso, [(None, [70, 30])], tipo=TipoActividad.grupal)
    ind, [c_ind] = _actividad(db_session, curso, [(None, [100])])
    _peso(db_session, grp, 40)
    _peso(db_session, ind, 60)
    ana = _estudiante(db_session, curso, "Ana")
    beto = _estudiante(db_session, curso, "Beto")
    carla = _estudiante(db_session, curso, "Carla")
    equipo = EquipoTrabajo(nombre="E1", actividad_id=grp.id, seccion_id=_seccion(db_session, curso).id)
    db_session.add(equipo)
    db_session.flush()
    db_session.add_all([MiembroEquipo(equipo_id=equipo.id, estudiante_id=e.id) for e in (ana, beto)])
    db_session.commit()

    _calificar(db_session, crits, [1, 0], equipo=equipo)  # 3.5
    _calificar(db_session, c_ind, [1], estudiante=ana)     # 5.0

    assert _promedios(client, db_session, curso) == {
        "Ana": 4.4,     # (3.5*40 + 5*60) / 100
        "Beto": 3.5,    # solo la grupal
        "Carla": None,  # sin equipo ni calificaciones
    }


def test_no_incluye_actividades_de_otro_curso(client, db_session, curso):
    otro = Curso(nombre="Otro", codigo="O-1", periodo="2026-2", docente_email=MOCK_USER["email"], ra_abet=[])
    db_session.add(otro)
    db_session.commit()
    _, [c_otro] = _actividad(db_session, otro, [(None, [100])])
    _, [c_propio] = _actividad(db_session, curso, [(None, [100])])
    ana = _estudiante(db_session, curso, "Ana")
    _calificar(db_session, c_otro, [1], estudiante=ana)
    _calificar(db_session, c_propio, [0], estudiante=ana)
    assert _promedios(client, db_session, curso) == {"Ana": 0.0}
