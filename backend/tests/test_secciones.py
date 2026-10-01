"""
Endpoints de secciones (routers/secciones.py) vistos por HTTP: listar, crear, renombrar
y eliminar, con los códigos de estado y los mensajes de error que recibe el usuario.

Reutiliza las fixtures de test_catalogo_ra_abet (SQLite en memoria).
"""
import pytest

from app.models import Curso, Estudiante, Seccion
from tests.test_calificaciones_lectura import _curso_ajeno
from tests.test_catalogo_ra_abet import MOCK_USER, client, db_session  # noqa: F401 (fixtures)


@pytest.fixture()
def curso(db_session):
    """Curso del docente con S1 y S2 activas y S3 archivada."""
    c = Curso(nombre="Redes", codigo="R-1", periodo="2026-2", docente_email=MOCK_USER["email"], ra_abet=[])
    db_session.add(c)
    db_session.flush()
    db_session.add_all([
        Seccion(nombre="S1", curso_id=c.id),
        Seccion(nombre="S2", curso_id=c.id),
        Seccion(nombre="S3", curso_id=c.id, activo=False),
    ])
    db_session.commit()
    return c


def _seccion(db_session, curso, nombre="S1"):
    return db_session.query(Seccion).filter_by(curso_id=curso.id, nombre=nombre).one()


def _con_estudiantes(db_session, seccion, cantidad):
    db_session.add_all(
        Estudiante(nombre_completo=f"EST {i}", codigo_estudiante=f"C{i}", seccion_id=seccion.id)
        for i in range(cantidad)
    )
    db_session.commit()


# ── Listar ───────────────────────────────────────────────────────────────────

class TestListarSecciones:
    def test_solo_activas_con_total_de_estudiantes(self, client, db_session, curso):
        _con_estudiantes(db_session, _seccion(db_session, curso, "S1"), 2)
        resp = client.get(f"/cursos/{curso.id}/secciones")
        assert resp.status_code == 200
        totales = {s["nombre"]: s["total_estudiantes"] for s in resp.json()}
        assert totales == {"S1": 2, "S2": 0}

    def test_curso_inexistente_404(self, client):
        resp = client.get("/cursos/99999/secciones")
        assert resp.status_code == 404
        assert resp.json() == {"detail": "Curso no encontrado"}

    def test_curso_de_otro_docente_403(self, client, db_session):
        ajeno = _curso_ajeno(db_session)
        resp = client.get(f"/cursos/{ajeno.id}/secciones")
        assert resp.status_code == 403
        assert resp.json() == {"detail": "No tiene permiso sobre este curso"}


# ── Crear ────────────────────────────────────────────────────────────────────

class TestCrearSeccion:
    def test_crea_activa_y_sin_estudiantes(self, client, db_session, curso):
        resp = client.post(f"/cursos/{curso.id}/secciones", json={"nombre": "S4"})
        assert resp.status_code == 201
        cuerpo = resp.json()
        assert cuerpo["nombre"] == "S4"
        assert cuerpo["curso_id"] == curso.id
        assert cuerpo["activo"] is True
        assert cuerpo["total_estudiantes"] == 0
        assert db_session.get(Seccion, cuerpo["id"]) is not None

    def test_curso_inexistente_404(self, client):
        resp = client.post("/cursos/99999/secciones", json={"nombre": "S4"})
        assert resp.status_code == 404
        assert resp.json() == {"detail": "Curso no encontrado"}

    def test_curso_de_otro_docente_403(self, client, db_session):
        ajeno = _curso_ajeno(db_session)
        resp = client.post(f"/cursos/{ajeno.id}/secciones", json={"nombre": "S4"})
        assert resp.status_code == 403
        assert resp.json() == {"detail": "No tiene permiso sobre este curso"}
        assert db_session.query(Seccion).filter_by(curso_id=ajeno.id).count() == 1


# ── Editar ───────────────────────────────────────────────────────────────────

class TestEditarSeccion:
    def test_renombra_y_conserva_el_total(self, client, db_session, curso):
        s1 = _seccion(db_session, curso)
        _con_estudiantes(db_session, s1, 1)
        resp = client.put(f"/secciones/{s1.id}", json={"nombre": "Grupo A"})
        assert resp.status_code == 200
        assert resp.json()["nombre"] == "Grupo A"
        assert resp.json()["total_estudiantes"] == 1

    def test_seccion_inexistente_404(self, client):
        resp = client.put("/secciones/99999", json={"nombre": "X"})
        assert resp.status_code == 404
        assert resp.json() == {"detail": "Sección no encontrada"}

    def test_seccion_de_otro_docente_403(self, client, db_session):
        ajena = _seccion(db_session, _curso_ajeno(db_session))
        resp = client.put(f"/secciones/{ajena.id}", json={"nombre": "Mía"})
        assert resp.status_code == 403
        assert resp.json() == {"detail": "No tiene permiso sobre este curso"}
        db_session.expire_all()
        assert db_session.get(Seccion, ajena.id).nombre == "S1"


# ── Eliminar ─────────────────────────────────────────────────────────────────

class TestEliminarSeccion:
    def test_sin_estudiantes_204(self, client, db_session, curso):
        s2 = _seccion(db_session, curso, "S2")
        resp = client.delete(f"/secciones/{s2.id}")
        assert resp.status_code == 204
        assert db_session.get(Seccion, s2.id) is None

    def test_con_estudiantes_409_y_no_se_borra(self, client, db_session, curso):
        s1 = _seccion(db_session, curso)
        _con_estudiantes(db_session, s1, 3)
        resp = client.delete(f"/secciones/{s1.id}")
        assert resp.status_code == 409
        assert resp.json() == {
            "detail": "No se puede eliminar la sección 'S1' porque tiene 3 estudiante(s) "
                      "registrado(s). Elimine los estudiantes primero."
        }
        assert db_session.get(Seccion, s1.id) is not None

    def test_seccion_inexistente_404(self, client):
        resp = client.delete("/secciones/99999")
        assert resp.status_code == 404
        assert resp.json() == {"detail": "Sección no encontrada"}

    def test_seccion_de_otro_docente_403(self, client, db_session):
        ajena = _seccion(db_session, _curso_ajeno(db_session))
        resp = client.delete(f"/secciones/{ajena.id}")
        assert resp.status_code == 403
        assert resp.json() == {"detail": "No tiene permiso sobre este curso"}
        assert db_session.get(Seccion, ajena.id) is not None
