"""
Endpoints de actividades (routers/actividades.py) vistos por HTTP: listar, crear,
obtener, editar y eliminar, con los códigos de estado, los mensajes exactos y el
formato JSON de cada respuesta (el detalle sale con números y el resto con Decimal
como texto: se fija tal cual está).

Reutiliza las fixtures de SQLite en memoria y los helpers de test_reportes.
"""
from datetime import datetime

import pytest

from app.models import Actividad
from tests.test_catalogo_ra_abet import client, db_session  # noqa: F401 (fixtures)
from tests.test_exportar_estudiantes import _curso, _est
from tests.test_reportes import _actividad, _calificar

OTRO = "otro@uao.edu.co"
CURSO_NO_ENCONTRADO = {"detail": "Curso no encontrado"}
CURSO_SIN_PERMISO = {"detail": "No tiene permiso sobre este curso"}
ACTIVIDAD_NO_ENCONTRADA = {"detail": "Actividad no encontrada"}
ACTIVIDAD_SIN_PERMISO = {"detail": "No tiene permiso sobre esta actividad"}
NUEVA = {"nombre": "Lab", "tipo": "grupal", "peso_nota_final": 15}


def _fechar(db_session, actividad, dia):
    actividad.created_at = datetime(2026, 9, dia, 12, 0)
    db_session.commit()


@pytest.fixture()
def curso(db_session):
    c, _ = _curso(db_session)
    return c


@pytest.fixture()
def ajeno(db_session):
    c, _ = _curso(db_session, "Ajena", "A-1", email=OTRO)
    return c


# ── Por curso: listar y crear ────────────────────────────────────────────────

POR_CURSO = [
    ("get", "/cursos/{id}/actividades", None),
    ("post", "/cursos/{id}/actividades", NUEVA),
]


@pytest.mark.parametrize("metodo,ruta,cuerpo", POR_CURSO, ids=["listar", "crear"])
def test_curso_inexistente_404(client, metodo, ruta, cuerpo):
    resp = getattr(client, metodo)(ruta.format(id=99999), **({"json": cuerpo} if cuerpo else {}))
    assert (resp.status_code, resp.json()) == (404, CURSO_NO_ENCONTRADO)


@pytest.mark.parametrize("metodo,ruta,cuerpo", POR_CURSO, ids=["listar", "crear"])
def test_curso_de_otro_docente_403_sin_crear(client, db_session, ajeno, metodo, ruta, cuerpo):
    resp = getattr(client, metodo)(ruta.format(id=ajeno.id), **({"json": cuerpo} if cuerpo else {}))
    assert (resp.status_code, resp.json()) == (403, CURSO_SIN_PERMISO)
    assert db_session.query(Actividad).filter_by(curso_id=ajeno.id).count() == 0


class TestListar:
    def test_orden_por_creacion_con_total_de_pesos(self, client, db_session, curso, ajeno):
        con_rubrica, _ = _actividad(db_session, curso, [(None, [60, 40])])
        sin_rubrica, _ = _actividad(db_session, curso, [])
        _actividad(db_session, ajeno, [(None, [100])])
        _fechar(db_session, con_rubrica, 2)
        _fechar(db_session, sin_rubrica, 1)

        resp = client.get(f"/cursos/{curso.id}/actividades")
        assert resp.status_code == 200
        assert [(a["id"], a["total_peso_criterios"], a["peso_nota_final"]) for a in resp.json()] == [
            (sin_rubrica.id, "0.00", "20.00"),
            (con_rubrica.id, "100.00", "20.00"),
        ]

    def test_sin_actividades(self, client, curso):
        assert client.get(f"/cursos/{curso.id}/actividades").json() == []


class TestCrear:
    def test_crea_con_total_en_cero(self, client, db_session, curso):
        resp = client.post(f"/cursos/{curso.id}/actividades", json=NUEVA)
        assert resp.status_code == 201
        cuerpo = resp.json()
        assert {k: cuerpo[k] for k in ("nombre", "tipo", "peso_nota_final", "curso_id", "total_peso_criterios")} == {
            "nombre": "Lab", "tipo": "grupal", "peso_nota_final": "15.00",
            "curso_id": curso.id, "total_peso_criterios": "0",
        }
        assert db_session.get(Actividad, cuerpo["id"]) is not None


# ── Por actividad: obtener, editar y eliminar ────────────────────────────────

POR_ACTIVIDAD = [
    ("get", None),
    ("put", {"nombre": "Otro"}),
    ("delete", None),
]


@pytest.mark.parametrize("metodo,cuerpo", POR_ACTIVIDAD, ids=["obtener", "editar", "eliminar"])
def test_actividad_inexistente_404(client, metodo, cuerpo):
    resp = getattr(client, metodo)("/actividades/99999", **({"json": cuerpo} if cuerpo else {}))
    assert (resp.status_code, resp.json()) == (404, ACTIVIDAD_NO_ENCONTRADA)


@pytest.mark.parametrize("metodo,cuerpo", POR_ACTIVIDAD, ids=["obtener", "editar", "eliminar"])
def test_actividad_de_otro_docente_403_sin_cambios(client, db_session, ajeno, metodo, cuerpo):
    act, _ = _actividad(db_session, ajeno, [])
    resp = getattr(client, metodo)(f"/actividades/{act.id}", **({"json": cuerpo} if cuerpo else {}))
    assert (resp.status_code, resp.json()) == (403, ACTIVIDAD_SIN_PERMISO)
    db_session.expire_all()
    assert db_session.get(Actividad, act.id).nombre == "Act"


class TestObtener:
    def test_detalle_con_aspectos_y_numeros_como_float(self, client, db_session, curso):
        act, [[c1, c2]] = _actividad(db_session, curso, [(None, [60, 40])])
        resp = client.get(f"/actividades/{act.id}")
        assert resp.status_code == 200
        cuerpo = resp.json()
        assert (cuerpo["id"], cuerpo["nombre"], cuerpo["tipo"]) == (act.id, "Act", "individual")
        # Sin response_model: los Decimal salen como número, no como texto
        assert (cuerpo["peso_nota_final"], cuerpo["total_peso_criterios"]) == (20.0, 100.0)
        [aspecto] = cuerpo["aspectos"]
        assert (aspecto["nombre"], aspecto["codigo_abet"]) == ("A0", None)
        assert [(c["id"], c["peso_porcentaje"]) for c in aspecto["criterios"]] == [(c1.id, 60.0), (c2.id, 40.0)]

    def test_sin_rubrica(self, client, db_session, curso):
        act, _ = _actividad(db_session, curso, [])
        cuerpo = client.get(f"/actividades/{act.id}").json()
        assert (cuerpo["total_peso_criterios"], cuerpo["aspectos"]) == (0.0, [])


class TestEditar:
    def test_cambia_solo_lo_enviado_y_devuelve_el_total(self, client, db_session, curso):
        act, _ = _actividad(db_session, curso, [(None, [100])])
        resp = client.put(f"/actividades/{act.id}", json={"nombre": "Proyecto"})
        assert resp.status_code == 200
        cuerpo = resp.json()
        assert (cuerpo["nombre"], cuerpo["peso_nota_final"], cuerpo["tipo"], cuerpo["total_peso_criterios"]) == (
            "Proyecto", "20.00", "individual", "100.00"
        )

    def test_el_tipo_no_es_editable(self, client, db_session, curso):
        act, _ = _actividad(db_session, curso, [])
        resp = client.put(f"/actividades/{act.id}", json={"tipo": "grupal", "peso_nota_final": 30})
        assert resp.status_code == 200
        assert (resp.json()["tipo"], resp.json()["peso_nota_final"]) == ("individual", "30.00")


class TestEliminar:
    def test_sin_calificaciones_204(self, client, db_session, curso):
        act, _ = _actividad(db_session, curso, [(None, [100])])
        assert client.delete(f"/actividades/{act.id}").status_code == 204
        db_session.expire_all()
        assert db_session.get(Actividad, act.id) is None

    def test_con_calificaciones_409_sin_borrar(self, client, db_session):
        curso, [s1] = _curso(db_session, "Bases", "BD-1")
        act, [criterios] = _actividad(db_session, curso, [(None, [100])])
        act.nombre = "Taller 1"
        db_session.commit()
        _calificar(db_session, criterios, [1], estudiante=_est(db_session, s1, "ANA", "1"))

        resp = client.delete(f"/actividades/{act.id}")
        assert (resp.status_code, resp.json()) == (409, {
            "detail": "No se puede eliminar 'Taller 1' porque ya tiene calificaciones registradas."
        })
        db_session.expire_all()
        assert db_session.get(Actividad, act.id) is not None
