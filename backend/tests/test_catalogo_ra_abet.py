"""
CRUD del catálogo RA ABET (Resultados de Aprendizaje y Criterios), protección 409
al borrar un código en uso o con Criterios hijos, y validación de ra_abet en /cursos.

Usa SQLite en memoria (solo las tablas cursos y ra_abet_catalogo) para no
tocar la base de desarrollo.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models import Curso, RaAbetCatalogo

MOCK_USER = {"email": "profesor.test@uao.edu.co", "nombre": "Profesor Test"}


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    # SQLite no aplica las FK por defecto; activarlas para comportarse como Postgres
    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Curso.metadata.create_all(engine, tables=[Curso.__table__, RaAbetCatalogo.__table__])
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _ra(codigo="2.1", **extra):
    return {"codigo": codigo, "competencia": "Diseño", "descripcion": f"Descripción {codigo}", **extra}


def _crear_curso(db_session, ra_abet, email=MOCK_USER["email"]):
    curso = Curso(nombre="Curso", codigo="C-1", periodo="2026-1", docente_email=email, ra_abet=ra_abet)
    db_session.add(curso)
    db_session.commit()
    return curso


class TestCrudCatalogo:
    def test_listar_vacio(self, client):
        resp = client.get("/catalogo/ra-abet")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_crear_deduce_so_y_programa_por_defecto(self, client):
        resp = client.post("/catalogo/ra-abet", json=_ra("2.1"))
        assert resp.status_code == 201
        assert resp.json() == {
            "codigo": "2.1",
            "so": "2",
            "competencia": "Diseño",
            "descripcion": "Descripción 2.1",
            "programa": "Ingeniería Informática",
            "codigo_padre": None,
            "peso": None,
        }

    def test_crear_respeta_so_explicito(self, client):
        resp = client.post("/catalogo/ra-abet", json=_ra("2.1", so="SO2"))
        assert resp.json()["so"] == "SO2"

    def test_crear_duplicado_409(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        resp = client.post("/catalogo/ra-abet", json=_ra("2.1"))
        assert resp.status_code == 409

    def test_crear_con_campo_vacio_422(self, client):
        resp = client.post("/catalogo/ra-abet", json=_ra("2.1", competencia="  "))
        assert resp.status_code == 422

    def test_competencia_larga_se_acepta(self, client):
        """La redacción oficial de algunas competencias supera los 200 caracteres."""
        competencia = "x" * 280
        resp = client.post("/catalogo/ra-abet", json=_ra("2.1", competencia=competencia))
        assert resp.status_code == 201
        assert resp.json()["competencia"] == competencia

        resp = client.post("/catalogo/ra-abet/importar", json={"items": [_ra("4.2", competencia=competencia)]})
        assert resp.status_code == 200
        catalogo = {r["codigo"]: r for r in client.get("/catalogo/ra-abet").json()}
        assert catalogo["4.2"]["competencia"] == competencia

    def test_listar_ordenado_por_codigo(self, client):
        for codigo in ["4.2", "1.1", "2.1"]:
            client.post("/catalogo/ra-abet", json=_ra(codigo))
        assert [r["codigo"] for r in client.get("/catalogo/ra-abet").json()] == ["1.1", "2.1", "4.2"]

    def test_editar(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        resp = client.put("/catalogo/ra-abet/2.1", json={"descripcion": "Corregida"})
        assert resp.status_code == 200
        assert resp.json()["descripcion"] == "Corregida"
        assert resp.json()["competencia"] == "Diseño"

    def test_editar_no_cambia_el_codigo(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        resp = client.put("/catalogo/ra-abet/2.1", json={"codigo": "9.9", "descripcion": "X"})
        assert resp.status_code == 200
        assert resp.json()["codigo"] == "2.1"

    def test_editar_inexistente_404(self, client):
        assert client.put("/catalogo/ra-abet/9.9", json={"descripcion": "X"}).status_code == 404

    def test_eliminar_sin_uso(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        assert client.delete("/catalogo/ra-abet/2.1").status_code == 204
        assert client.get("/catalogo/ra-abet").json() == []

    def test_eliminar_inexistente_404(self, client):
        assert client.delete("/catalogo/ra-abet/9.9").status_code == 404


class TestEliminarEnUso:
    def test_eliminar_codigo_en_uso_409(self, client, db_session):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        _crear_curso(db_session, ["2.1"])

        resp = client.delete("/catalogo/ra-abet/2.1")
        assert resp.status_code == 409
        assert "en uso por 1 curso" in resp.json()["detail"]
        assert [r["codigo"] for r in client.get("/catalogo/ra-abet").json()] == ["2.1"]

    def test_en_uso_por_curso_de_otro_docente_tambien_409(self, client, db_session):
        """El catálogo es global: protege códigos usados por cualquier docente."""
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        _crear_curso(db_session, ["2.1"], email="otro.docente@uao.edu.co")
        assert client.delete("/catalogo/ra-abet/2.1").status_code == 409

    def test_codigo_parecido_no_cuenta_como_uso(self, client, db_session):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        _crear_curso(db_session, ["2.10", "12.1"])
        assert client.delete("/catalogo/ra-abet/2.1").status_code == 204


class TestImportar:
    def test_crea_y_actualiza(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        resp = client.post(
            "/catalogo/ra-abet/importar",
            json={"items": [_ra("2.1", descripcion="Nueva desc"), _ra("4.2")]},
        )
        assert resp.status_code == 200
        assert resp.json() == {"creados": 1, "actualizados": 1}

        catalogo = {r["codigo"]: r for r in client.get("/catalogo/ra-abet").json()}
        assert catalogo["2.1"]["descripcion"] == "Nueva desc"
        assert catalogo["4.2"]["so"] == "4"

    def test_actualizar_no_pisa_campos_no_enviados(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1", programa="Ingeniería de Sistemas"))
        client.post("/catalogo/ra-abet/importar", json={"items": [_ra("2.1", descripcion="Nueva")]})
        ra = client.get("/catalogo/ra-abet").json()[0]
        assert ra["descripcion"] == "Nueva"
        assert ra["programa"] == "Ingeniería de Sistemas"

    def test_codigos_repetidos_no_guarda_nada(self, client):
        resp = client.post(
            "/catalogo/ra-abet/importar",
            json={"items": [_ra("2.1"), _ra("4.2"), _ra("2.1")]},
        )
        assert resp.status_code == 422
        assert client.get("/catalogo/ra-abet").json() == []

    def test_fila_invalida_no_guarda_nada(self, client):
        resp = client.post(
            "/catalogo/ra-abet/importar",
            json={"items": [_ra("2.1"), _ra("4.2", descripcion="")]},
        )
        assert resp.status_code == 422
        assert client.get("/catalogo/ra-abet").json() == []

    def test_importacion_vacia_422(self, client):
        assert client.post("/catalogo/ra-abet/importar", json={"items": []}).status_code == 422


class TestValidacionRaAbetEnCursos:
    CURSO = {"nombre": "Curso", "codigo": "C-1", "periodo": "2026-1"}

    def test_crear_curso_con_codigo_desconocido_422(self, client):
        resp = client.post("/cursos", json={**self.CURSO, "ra_abet": ["9.9"]})
        assert resp.status_code == 422
        assert "9.9" in resp.json()["detail"]

    def test_crear_curso_con_codigos_del_catalogo(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        resp = client.post("/cursos", json={**self.CURSO, "ra_abet": ["2.1"]})
        assert resp.status_code == 201
        body = resp.json()
        assert body["ra_abet"] == ["2.1"]
        assert [r["etiqueta"] for r in body["rangos_calificacion"]] == ["0.0-2.9", "3.0-3.9", "4.0-5.0"]

    def test_editar_curso_valida_codigos(self, client, db_session):
        curso = _crear_curso(db_session, [])
        resp = client.put(f"/cursos/{curso.id}", json={"ra_abet": ["9.9"]})
        assert resp.status_code == 422

    def test_editar_curso_sin_ra_abet_conserva_valores_antiguos(self, client, db_session):
        """Cursos previos con textos que no están en el catálogo pueden editarse si no se envía ra_abet."""
        curso = _crear_curso(db_session, ["RA1: Análisis de problemas"])
        resp = client.put(
            f"/cursos/{curso.id}",
            json={"nombre": "Renombrado", "rangos_calificacion": [{"etiqueta": "Todo", "minimo": 0, "maximo": 5}]},
        )
        assert resp.status_code == 200
        assert resp.json()["ra_abet"] == ["RA1: Análisis de problemas"]
        assert resp.json()["rangos_calificacion"] == [{"etiqueta": "Todo", "minimo": 0.0, "maximo": 5.0}]
