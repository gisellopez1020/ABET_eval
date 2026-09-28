"""Cerrar (archivar) y reactivar un curso."""
from tests.test_catalogo_ra_abet import MOCK_USER, _crear_curso, client, db_session  # noqa: F401 (fixtures)


def test_archivar_y_activar(client, db_session):
    curso = _crear_curso(db_session, [])

    resp = client.patch(f"/cursos/{curso.id}/archivar")
    assert resp.status_code == 200
    assert resp.json()["activo"] is False

    resp = client.patch(f"/cursos/{curso.id}/activar")
    assert resp.status_code == 200
    assert resp.json()["activo"] is True
    db_session.refresh(curso)
    assert curso.activo is True


def test_activar_curso_ya_activo_es_idempotente(client, db_session):
    curso = _crear_curso(db_session, [])
    resp = client.patch(f"/cursos/{curso.id}/activar")
    assert resp.status_code == 200
    assert resp.json()["activo"] is True


def test_curso_de_otro_docente_403(client, db_session):
    ajeno = _crear_curso(db_session, [], email="otro@uao.edu.co")
    assert client.patch(f"/cursos/{ajeno.id}/archivar").status_code == 403
    assert client.patch(f"/cursos/{ajeno.id}/activar").status_code == 403
    db_session.refresh(ajeno)
    assert ajeno.activo is True


def test_curso_inexistente_404(client):
    assert client.patch("/cursos/99999/archivar").status_code == 404
    assert client.patch("/cursos/99999/activar").status_code == 404
