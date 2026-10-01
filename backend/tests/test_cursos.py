"""
Endpoints de cursos (routers/cursos.py) vistos por HTTP: lo que no cubren
test_archivar_activar, test_actividad_reciente ni las pruebas de ra_abet de
test_catalogo_*. Fija los códigos de estado y los mensajes exactos que recibe el usuario.

Reutiliza las fixtures de test_catalogo_ra_abet (SQLite en memoria).
"""
import pytest

from app.models import Curso
from tests.test_catalogo_jerarquia import _crit
from tests.test_catalogo_ra_abet import MOCK_USER, _crear_curso, _ra, client, db_session  # noqa: F401 (fixtures)

NO_ENCONTRADO = {"detail": "Curso no encontrado"}
SIN_PERMISO = {"detail": "No tiene permiso para acceder a este curso"}

# (método, ruta con {id}, cuerpo) de los endpoints que reciben el id del curso
CON_ID = [
    ("get", "/cursos/{id}", None),
    ("put", "/cursos/{id}", {"nombre": "Otro"}),
    ("get", "/cursos/{id}/actividad-reciente", None),
    ("patch", "/cursos/{id}/archivar", None),
    ("patch", "/cursos/{id}/activar", None),
]


def _pedir(client, metodo, ruta, cuerpo, curso_id):
    url = ruta.format(id=curso_id)
    return getattr(client, metodo)(url, json=cuerpo) if cuerpo is not None else getattr(client, metodo)(url)


@pytest.fixture()
def catalogo(client):
    """RA 2.1 con su Criterio 2.1.1."""
    client.post("/catalogo/ra-abet", json=_ra("2.1"))
    client.post("/catalogo/ra-abet", json=_crit("2.1.1", "2.1", 1))


# ── Mensajes de 404 y 403 en todos los endpoints con id ──────────────────────

@pytest.mark.parametrize("metodo,ruta,cuerpo", CON_ID)
def test_curso_inexistente_404(client, metodo, ruta, cuerpo):
    resp = _pedir(client, metodo, ruta, cuerpo, 99999)
    assert resp.status_code == 404
    assert resp.json() == NO_ENCONTRADO


@pytest.mark.parametrize("metodo,ruta,cuerpo", CON_ID)
def test_curso_de_otro_docente_403(client, db_session, metodo, ruta, cuerpo):
    ajeno = _crear_curso(db_session, [], email="otro@uao.edu.co")
    resp = _pedir(client, metodo, ruta, cuerpo, ajeno.id)
    assert resp.status_code == 403
    assert resp.json() == SIN_PERMISO
    db_session.expire_all()
    assert (ajeno.nombre, ajeno.activo) == ("Curso", True)


# ── Listar ───────────────────────────────────────────────────────────────────

class TestListarCursos:
    def test_sin_cursos_lista_vacia(self, client):
        resp = client.get("/cursos")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_activos_y_archivados_del_docente_sin_los_ajenos(self, client, db_session):
        activo = _crear_curso(db_session, [])
        archivado = _crear_curso(db_session, [])
        archivado.activo = False
        db_session.commit()
        _crear_curso(db_session, [], email="otro@uao.edu.co")

        resp = client.get("/cursos")
        assert resp.status_code == 200
        assert {(c["id"], c["activo"]) for c in resp.json()} == {(activo.id, True), (archivado.id, False)}
        assert all(c["docente_email"] == MOCK_USER["email"] for c in resp.json())


# ── Obtener ──────────────────────────────────────────────────────────────────

class TestObtenerCurso:
    def test_detalle(self, client, db_session):
        curso = _crear_curso(db_session, ["2.1"])
        resp = client.get(f"/cursos/{curso.id}")
        assert resp.status_code == 200
        cuerpo = resp.json()
        assert (cuerpo["id"], cuerpo["nombre"], cuerpo["codigo"], cuerpo["ra_abet"]) == (
            curso.id, "Curso", "C-1", ["2.1"]
        )


# ── Crear ────────────────────────────────────────────────────────────────────

class TestCrearCurso:
    CURSO = {"nombre": "Redes", "codigo": "R-1", "periodo": "2026-2"}

    def test_crea_del_docente(self, client, db_session):
        resp = client.post("/cursos", json=self.CURSO)
        assert resp.status_code == 201
        assert resp.json()["docente_email"] == MOCK_USER["email"]
        assert db_session.get(Curso, resp.json()["id"]) is not None

    def test_codigos_desconocidos_422(self, client, db_session, catalogo):
        resp = client.post("/cursos", json={**self.CURSO, "ra_abet": ["2.1", "9.9", "8.8"]})
        assert resp.status_code == 422
        assert resp.json() == {"detail": "Códigos RA ABET que no existen en el catálogo: 9.9, 8.8"}
        assert db_session.query(Curso).count() == 0

    def test_codigos_de_criterio_422(self, client, db_session, catalogo):
        resp = client.post("/cursos", json={**self.CURSO, "ra_abet": ["2.1", "2.1.1"]})
        assert resp.status_code == 422
        assert resp.json() == {
            "detail": "Un curso solo puede tener Resultados de Aprendizaje, no Criterios: 2.1.1"
        }
        assert db_session.query(Curso).count() == 0


# ── Editar ───────────────────────────────────────────────────────────────────

class TestEditarCurso:
    def test_cambia_solo_lo_enviado(self, client, db_session):
        curso = _crear_curso(db_session, ["RA antiguo"])
        resp = client.put(f"/cursos/{curso.id}", json={"nombre": "Renombrado"})
        assert resp.status_code == 200
        assert (resp.json()["nombre"], resp.json()["codigo"], resp.json()["ra_abet"]) == (
            "Renombrado", "C-1", ["RA antiguo"]
        )

    def test_cambia_ra_abet_validos(self, client, db_session, catalogo):
        curso = _crear_curso(db_session, [])
        resp = client.put(f"/cursos/{curso.id}", json={"ra_abet": ["2.1"]})
        assert resp.status_code == 200
        assert resp.json()["ra_abet"] == ["2.1"]

    def test_codigos_desconocidos_422(self, client, db_session):
        curso = _crear_curso(db_session, [])
        resp = client.put(f"/cursos/{curso.id}", json={"nombre": "X", "ra_abet": ["9.9"]})
        assert resp.status_code == 422
        assert resp.json() == {"detail": "Códigos RA ABET que no existen en el catálogo: 9.9"}
        db_session.expire_all()
        assert (curso.nombre, curso.ra_abet) == ("Curso", [])

    def test_codigos_de_criterio_422(self, client, db_session, catalogo):
        curso = _crear_curso(db_session, [])
        resp = client.put(f"/cursos/{curso.id}", json={"ra_abet": ["2.1.1"]})
        assert resp.status_code == 422
        assert resp.json() == {
            "detail": "Un curso solo puede tener Resultados de Aprendizaje, no Criterios: 2.1.1"
        }
        db_session.expire_all()
        assert curso.ra_abet == []
