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
