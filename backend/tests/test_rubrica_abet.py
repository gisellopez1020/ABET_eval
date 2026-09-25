"""
Vínculo opcional Aspecto -> Criterio ABET (aspectos.codigo_abet):
validación en PUT /criterios y en PATCH .../codigo-abet, agregado automático del
RA padre al ra_abet del curso, rúbricas con calificaciones y el 409 del catálogo.

Reutiliza las fixtures de SQLite en memoria (esquema completo, FK activadas).
"""
import pytest

from app.models import Actividad, Aspecto, Calificacion, Criterio, Curso, Estudiante, Seccion
from app.models.actividad import TipoActividad
from tests.test_catalogo_ra_abet import MOCK_USER, _ra, client, db_session  # noqa: F401 (fixtures)
from tests.test_catalogo_jerarquia import _crit


@pytest.fixture()
def actividad(client, db_session):
    """Curso del docente (con un RA antiguo en texto libre) + actividad + catálogo 2.1 / 2.1.1 / 2.1.2."""
    curso = Curso(
        nombre="Redes", codigo="R-1", periodo="2026-2",
        docente_email=MOCK_USER["email"], ra_abet=["RA1: texto antiguo"],
    )
    db_session.add(curso)
    db_session.flush()
    act = Actividad(nombre="Lab 1", tipo=TipoActividad.individual, peso_nota_final=20, curso_id=curso.id)
    db_session.add(act)
    db_session.commit()

    client.post("/catalogo/ra-abet", json=_ra("2.1"))
    client.post("/catalogo/ra-abet", json=_crit("2.1.1", "2.1", 0.5))
    client.post("/catalogo/ra-abet", json=_crit("2.1.2", "2.1", 0.5))
    client.post("/catalogo/ra-abet", json=_ra("4.1"))
    client.post("/catalogo/ra-abet", json=_crit("4.1.1", "4.1", 1))
    return act


def _rubrica(*codigos):
    """Un aspecto por código (None = sin vincular); pesos que suman 100."""
    peso = 100 / len(codigos)
    return {
        "aspectos": [
            {
                "nombre": f"Aspecto {i}",
                "orden": i,
                "codigo_abet": codigo,
                "criterios": [{"texto": f"Criterio {i}", "peso_porcentaje": peso, "orden": 0}],
            }
            for i, codigo in enumerate(codigos)
        ]
    }


def _ra_curso(db_session, actividad):
    db_session.expire_all()
    return db_session.get(Curso, actividad.curso_id).ra_abet


def _calificar(db_session, actividad):
    """Registra una calificación en la actividad (bloquea el reemplazo de la rúbrica)."""
    seccion = Seccion(nombre="S1", curso_id=actividad.curso_id)
    db_session.add(seccion)
    db_session.flush()
    estudiante = Estudiante(nombre_completo="ANA", codigo_estudiante="1", seccion_id=seccion.id)
    db_session.add(estudiante)
    db_session.flush()
    criterio = db_session.query(Criterio).join(Aspecto).filter(Aspecto.actividad_id == actividad.id).first()
    db_session.add(Calificacion(criterio_id=criterio.id, valor=1, estudiante_id=estudiante.id, nota_calculada=5))
    db_session.commit()


class TestPutConCodigoAbet:
    def test_guarda_el_vinculo_y_agrega_el_ra_al_curso(self, client, db_session, actividad):
        resp = client.put(f"/actividades/{actividad.id}/criterios", json=_rubrica("2.1.1", None))
        assert resp.status_code == 200
        assert [a["codigo_abet"] for a in resp.json()["aspectos"]] == ["2.1.1", None]
        # Conserva el valor antiguo y agrega el RA padre al final
        assert _ra_curso(db_session, actividad) == ["RA1: texto antiguo", "2.1"]

    def test_no_duplica_el_ra(self, client, db_session, actividad):
        client.put(f"/actividades/{actividad.id}/criterios", json=_rubrica("2.1.1", "2.1.2"))
        client.put(f"/actividades/{actividad.id}/criterios", json=_rubrica("2.1.2"))
        assert _ra_curso(db_session, actividad) == ["RA1: texto antiguo", "2.1"]

    def test_get_devuelve_el_vinculo(self, client, actividad):
        client.put(f"/actividades/{actividad.id}/criterios", json=_rubrica("4.1.1"))
        body = client.get(f"/actividades/{actividad.id}/criterios").json()
        assert body["aspectos"][0]["codigo_abet"] == "4.1.1"
        assert body["tiene_calificaciones"] is False

    def test_sin_codigo_o_vacio(self, client, db_session, actividad):
        resp = client.put(f"/actividades/{actividad.id}/criterios", json=_rubrica(None, "   "))
        assert resp.status_code == 200
        assert [a["codigo_abet"] for a in resp.json()["aspectos"]] == [None, None]
        assert _ra_curso(db_session, actividad) == ["RA1: texto antiguo"]

    def test_codigo_inexistente_422_y_no_toca_nada(self, client, db_session, actividad):
        client.put(f"/actividades/{actividad.id}/criterios", json=_rubrica("2.1.1"))
        resp = client.put(f"/actividades/{actividad.id}/criterios", json=_rubrica("9.9.9"))
        assert resp.status_code == 422
        assert "'9.9.9' no existe" in resp.json()["detail"]
        aspectos = client.get(f"/actividades/{actividad.id}/criterios").json()["aspectos"]
        assert [a["codigo_abet"] for a in aspectos] == ["2.1.1"]

    def test_codigo_de_un_ra_422_con_mensaje_explicito(self, client, db_session, actividad):
        resp = client.put(f"/actividades/{actividad.id}/criterios", json=_rubrica("2.1"))
        assert resp.status_code == 422
        assert resp.json()["detail"] == (
            "'2.1' es un Resultado de Aprendizaje, no un Criterio — usa un código como 2.1.1"
        )
        assert _ra_curso(db_session, actividad) == ["RA1: texto antiguo"]

    def test_supera_el_maximo_de_ra_del_curso_422(self, client, db_session, actividad):
        curso = db_session.get(Curso, actividad.curso_id)
        curso.ra_abet = [f"viejo {i}" for i in range(10)]
        db_session.commit()
        resp = client.put(f"/actividades/{actividad.id}/criterios", json=_rubrica("2.1.1"))
        assert resp.status_code == 422
        assert "ya tiene 10 de 10 RA ABET" in resp.json()["detail"]
        assert client.get(f"/actividades/{actividad.id}/criterios").json()["aspectos"] == []

    def test_ra_ya_presente_no_cuenta_contra_el_maximo(self, client, db_session, actividad):
        curso = db_session.get(Curso, actividad.curso_id)
        curso.ra_abet = ["2.1"] + [f"viejo {i}" for i in range(9)]
        db_session.commit()
        assert client.put(f"/actividades/{actividad.id}/criterios", json=_rubrica("2.1.1")).status_code == 200


class TestRubricaConCalificaciones:
    @pytest.fixture()
    def calificada(self, client, db_session, actividad):
        client.put(f"/actividades/{actividad.id}/criterios", json=_rubrica(None, None))
        _calificar(db_session, actividad)
        aspectos = client.get(f"/actividades/{actividad.id}/criterios").json()["aspectos"]
        return actividad, aspectos

    def test_get_indica_tiene_calificaciones(self, client, calificada):
        act, _ = calificada
        assert client.get(f"/actividades/{act.id}/criterios").json()["tiene_calificaciones"] is True

    def test_put_sigue_bloqueado_409(self, client, calificada):
        act, _ = calificada
        assert client.put(f"/actividades/{act.id}/criterios", json=_rubrica("2.1.1")).status_code == 409

    def test_patch_vincula_sin_reconstruir_y_agrega_el_ra(self, client, db_session, calificada):
        act, aspectos = calificada
        aspecto_id = aspectos[0]["id"]
        resp = client.patch(
            f"/actividades/{act.id}/aspectos/{aspecto_id}/codigo-abet", json={"codigo_abet": "4.1.1"}
        )
        assert resp.status_code == 200
        assert (resp.json()["id"], resp.json()["codigo_abet"]) == (aspecto_id, "4.1.1")
        assert _ra_curso(db_session, act) == ["RA1: texto antiguo", "4.1"]
        # La calificación sigue ahí (no se reconstruyó la rúbrica)
        assert db_session.query(Calificacion).count() == 1

    def test_patch_null_desvincula(self, client, calificada):
        act, aspectos = calificada
        url = f"/actividades/{act.id}/aspectos/{aspectos[0]['id']}/codigo-abet"
        client.patch(url, json={"codigo_abet": "2.1.1"})
        resp = client.patch(url, json={"codigo_abet": None})
        assert resp.status_code == 200
        assert resp.json()["codigo_abet"] is None

    def test_patch_valida_igual_que_put(self, client, calificada):
        act, aspectos = calificada
        url = f"/actividades/{act.id}/aspectos/{aspectos[0]['id']}/codigo-abet"
        assert client.patch(url, json={"codigo_abet": "9.9.9"}).status_code == 422
        resp = client.patch(url, json={"codigo_abet": "2.1"})
        assert resp.status_code == 422
        assert "es un Resultado de Aprendizaje, no un Criterio" in resp.json()["detail"]

    def test_patch_aspecto_de_otra_actividad_404(self, client, db_session, calificada):
        act, aspectos = calificada
        otra = Actividad(nombre="Otra", tipo=TipoActividad.individual, peso_nota_final=10, curso_id=act.curso_id)
        db_session.add(otra)
        db_session.commit()
        resp = client.patch(
            f"/actividades/{otra.id}/aspectos/{aspectos[0]['id']}/codigo-abet", json={"codigo_abet": "2.1.1"}
        )
        assert resp.status_code == 404


class TestBorrarCodigoVinculado:
    def test_delete_de_un_codigo_vinculado_409(self, client, actividad):
        client.put(f"/actividades/{actividad.id}/criterios", json=_rubrica("2.1.2"))
        resp = client.delete("/catalogo/ra-abet/2.1.2")
        assert resp.status_code == 409
        assert "vinculado a 1 aspecto de rúbrica" in resp.json()["detail"]

    def test_tras_desvincular_se_puede_borrar(self, client, actividad):
        client.put(f"/actividades/{actividad.id}/criterios", json=_rubrica("2.1.2"))
        client.put(f"/actividades/{actividad.id}/criterios", json=_rubrica(None))
        assert client.delete("/catalogo/ra-abet/2.1.2").status_code == 204
