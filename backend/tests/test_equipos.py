"""
Equipos de trabajo (routers/equipos.py): creación y edición, pertenencia de los
miembros a la sección, un solo equipo por estudiante en cada actividad, listado con
estado de calificación y el modo de calificación grupal/individual.

Reutiliza las fixtures y utilidades de test_reportes (SQLite en memoria).
"""
import pytest
from fastapi.testclient import TestClient

from app.models import EquipoTrabajo, Estudiante, MiembroEquipo
from app.models.actividad import TipoActividad
from tests.test_catalogo_ra_abet import MOCK_USER, client, db_session  # noqa: F401 (fixtures)
from tests.test_reportes import _actividad, _calificar, _estudiante, _seccion, curso  # noqa: F401


def _url(actividad, seccion):
    return f"/actividades/{actividad.id}/secciones/{seccion.id}/equipos"


def _crear(client, actividad, seccion, *equipos):
    """equipos: (nombre, [estudiantes])."""
    return client.post(_url(actividad, seccion), json={
        "equipos": [{"nombre": n, "estudiante_ids": [e.id for e in ests]} for n, ests in equipos]
    })


def _ids_miembros(equipo_json):
    return sorted(m["id"] for m in equipo_json["miembros"])


@pytest.fixture()
def grupal(db_session, curso):
    act, [crits] = _actividad(db_session, curso, [(None, [40, 60])], tipo=TipoActividad.grupal)
    return act, crits


@pytest.fixture()
def alumnos(db_session, curso):
    return [_estudiante(db_session, curso, n) for n in ("Ana", "Beto", "Caro")]


# ── Crear ────────────────────────────────────────────────────────────────────

class TestCrearEquipos:
    def test_crea_varios_equipos_con_sus_miembros(self, client, db_session, curso, grupal, alumnos):
        act, _ = grupal
        ana, beto, caro = alumnos
        resp = _crear(client, act, _seccion(db_session, curso), ("E1", [ana, beto]), ("E2", [caro]))
        assert resp.status_code == 201
        e1, e2 = resp.json()
        assert (e1["nombre"], _ids_miembros(e1)) == ("E1", sorted([ana.id, beto.id]))
        assert (e2["nombre"], _ids_miembros(e2)) == ("E2", [caro.id])
        assert e1["calificado"] is False and e1["nota_total"] is None


class TestUnEquipoPorActividad:
    def test_crear_con_estudiante_que_ya_esta_en_otro_equipo_400(self, client, db_session, curso, grupal, alumnos):
        act, _ = grupal
        ana, beto, _ = alumnos
        s1 = _seccion(db_session, curso)
        assert _crear(client, act, s1, ("E1", [ana])).status_code == 201

        resp = _crear(client, act, s1, ("E2", [beto, ana]))
        assert resp.status_code == 400
        assert resp.json()["detail"] == "El estudiante Ana ya está en el equipo 'E1' de esta actividad"

    def test_crear_dos_equipos_del_mismo_payload_con_el_mismo_estudiante_400(
        self, client, db_session, curso, grupal, alumnos
    ):
        act, _ = grupal
        ana, beto, _ = alumnos
        resp = _crear(client, act, _seccion(db_session, curso), ("E1", [ana]), ("E2", [beto, ana]))
        assert resp.status_code == 400
        assert resp.json()["detail"] == "El estudiante Ana está en dos equipos: 'E1' y 'E2'"

    def test_editar_agregando_estudiante_de_otro_equipo_400(self, client, db_session, curso, grupal, alumnos):
        act, _ = grupal
        ana, beto, _ = alumnos
        e1, e2 = _crear(client, act, _seccion(db_session, curso), ("E1", [ana]), ("E2", [beto])).json()

        resp = client.put(f"/equipos/{e2['id']}", json={"estudiante_ids": [beto.id, ana.id]})
        assert resp.status_code == 400
        assert resp.json()["detail"] == "El estudiante Ana ya está en el equipo 'E1' de esta actividad"

    def test_editar_sin_cambiar_miembros_no_choca_consigo_mismo(self, client, db_session, curso, grupal, alumnos):
        act, _ = grupal
        ana, beto, _ = alumnos
        [e1] = _crear(client, act, _seccion(db_session, curso), ("E1", [ana, beto])).json()

        resp = client.put(f"/equipos/{e1['id']}", json={"nombre": "E1", "estudiante_ids": [ana.id, beto.id]})
        assert resp.status_code == 200
        assert _ids_miembros(resp.json()) == sorted([ana.id, beto.id])

    def test_mismo_estudiante_en_otra_actividad_de_la_misma_seccion(self, client, db_session, curso, grupal, alumnos):
        act, _ = grupal
        otra, _ = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
        ana = alumnos[0]
        s1 = _seccion(db_session, curso)
        assert _crear(client, act, s1, ("E1", [ana])).status_code == 201
        assert _crear(client, otra, s1, ("Otro E1", [ana])).status_code == 201

    def test_estudiante_repetido_en_el_mismo_equipo_400(self, client, db_session, curso, grupal, alumnos):
        act, _ = grupal
        ana = alumnos[0]
        resp = TestClient(client.app, raise_server_exceptions=False).post(
            _url(act, _seccion(db_session, curso)),
            json={"equipos": [{"nombre": "E1", "estudiante_ids": [ana.id, ana.id]}]},
        )
        assert resp.status_code == 400


# ── Editar ───────────────────────────────────────────────────────────────────

class TestEditarEquipo:
    @pytest.fixture()
    def equipo(self, client, db_session, curso, grupal, alumnos):
        act, _ = grupal
        [e1] = _crear(client, act, _seccion(db_session, curso), ("E1", alumnos[:2])).json()
        return e1

    def test_renombrar_conserva_miembros(self, client, equipo):
        resp = client.put(f"/equipos/{equipo['id']}", json={"nombre": "Los Rápidos"})
        assert resp.status_code == 200
        assert resp.json()["nombre"] == "Los Rápidos"
        assert _ids_miembros(resp.json()) == _ids_miembros(equipo)

    def test_nombre_vacio_se_ignora(self, client, equipo):
        resp = client.put(f"/equipos/{equipo['id']}", json={"nombre": ""})
        assert resp.json()["nombre"] == "E1"

    def test_reemplazar_miembros(self, client, equipo, alumnos):
        caro = alumnos[2]
        resp = client.put(f"/equipos/{equipo['id']}", json={"estudiante_ids": [caro.id]})
        assert resp.status_code == 200
        assert _ids_miembros(resp.json()) == [caro.id]

    def test_lista_vacia_deja_el_equipo_sin_miembros(self, client, db_session, equipo):
        resp = client.put(f"/equipos/{equipo['id']}", json={"estudiante_ids": []})
        assert resp.json()["miembros"] == []
        assert db_session.query(MiembroEquipo).count() == 0

    def test_estudiante_repetido_400(self, client, db_session, equipo, alumnos):
        ana = alumnos[0]
        resp = TestClient(client.app, raise_server_exceptions=False).put(
            f"/equipos/{equipo['id']}", json={"estudiante_ids": [ana.id, ana.id]}
        )
        assert resp.status_code == 400
        assert "repetido" in resp.json()["detail"]
        # Falla antes de tocar los integrantes: el equipo conserva los que tenía
        miembros = db_session.query(MiembroEquipo.estudiante_id).filter_by(equipo_id=equipo["id"]).all()
        assert sorted(eid for (eid,) in miembros) == sorted(_ids_miembros(equipo))


# ── Eliminar un estudiante que está en un equipo ─────────────────────────────

class TestEliminarEstudianteDeEquipo:
    def test_el_equipo_sigue_con_los_demas_integrantes(self, client, db_session, curso, grupal, alumnos):
        act, crits = grupal
        ana, beto, _ = alumnos
        s1 = _seccion(db_session, curso)
        [equipo] = _crear(client, act, s1, ("E1", [ana, beto])).json()
        _calificar(db_session, crits, [1, 1], equipo=db_session.get(EquipoTrabajo, equipo["id"]))

        assert client.delete(f"/estudiantes/{ana.id}").status_code == 204

        [restante] = client.get(_url(act, s1)).json()
        assert (restante["id"], restante["nombre"]) == (equipo["id"], "E1")
        assert _ids_miembros(restante) == [beto.id]
        # Las calificaciones son del equipo, no de Ana: se conservan
        assert restante["calificado"] is True

    def test_el_ultimo_integrante_deja_el_equipo_vacio_y_se_puede_eliminar(self, client, db_session, curso, grupal, alumnos):
        """El equipo no se borra solo: queda vacío y el docente decide (DELETE /equipos/{id})."""
        act, _ = grupal
        ana = alumnos[0]
        s1 = _seccion(db_session, curso)
        _crear(client, act, s1, ("Solo Ana", [ana]))

        assert client.delete(f"/estudiantes/{ana.id}").status_code == 204

        [vacio] = client.get(_url(act, s1)).json()
        assert (vacio["nombre"], vacio["miembros"]) == ("Solo Ana", [])

        assert client.delete(f"/equipos/{vacio['id']}").status_code == 204
        assert client.get(_url(act, s1)).json() == []


# ── Eliminar ─────────────────────────────────────────────────────────────────

class TestEliminarEquipo:
    def test_elimina_el_equipo_y_sus_membresias_pero_no_a_los_estudiantes(self, client, db_session, curso, grupal, alumnos):
        act, _ = grupal
        s1 = _seccion(db_session, curso)
        borrar, conservar = _crear(client, act, s1, ("Borrar", alumnos[:2]), ("Conservar", [alumnos[2]])).json()

        resp = client.delete(f"/equipos/{borrar['id']}")

        assert resp.status_code == 204
        assert [e["nombre"] for e in client.get(_url(act, s1)).json()] == ["Conservar"]
        assert db_session.query(MiembroEquipo).filter_by(equipo_id=borrar["id"]).count() == 0
        assert all(db_session.get(Estudiante, a.id) is not None for a in alumnos)

    def test_sus_integrantes_quedan_libres_para_otro_equipo(self, client, db_session, curso, grupal, alumnos):
        act, _ = grupal
        s1 = _seccion(db_session, curso)
        [equipo] = _crear(client, act, s1, ("E1", alumnos[:1])).json()
        client.delete(f"/equipos/{equipo['id']}")
        assert _crear(client, act, s1, ("E2", alumnos[:1])).status_code == 201


# ── Listar ───────────────────────────────────────────────────────────────────

class TestListarEquipos:
    def test_solo_los_de_la_actividad_y_la_seccion(self, client, db_session, curso, grupal, alumnos):
        act, _ = grupal
        otra, _ = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
        s1, s2 = _seccion(db_session, curso), _seccion(db_session, curso, "S2")
        _crear(client, act, s1, ("E1", [alumnos[0]]))
        _crear(client, act, s2, ("En S2", []))
        _crear(client, otra, s1, ("De otra", [alumnos[0]]))

        resp = client.get(_url(act, s1))
        assert resp.status_code == 200
        assert [e["nombre"] for e in resp.json()] == ["E1"]

    def test_estado_de_calificacion(self, client, db_session, curso, grupal):
        act, crits = grupal
        s1 = _seccion(db_session, curso)
        completo, parcial = _crear(client, act, s1, ("Completo", []), ("Parcial", [])).json()
        _calificar(db_session, crits, [1, 1], equipo=db_session.get(EquipoTrabajo, completo["id"]))
        _calificar(db_session, crits[:1], [1], equipo=db_session.get(EquipoTrabajo, parcial["id"]))

        por_nombre = {e["nombre"]: e for e in client.get(_url(act, s1)).json()}
        assert por_nombre["Completo"]["calificado"] is True
        assert float(por_nombre["Completo"]["nota_total"]) == 5.0
        assert por_nombre["Parcial"]["calificado"] is False
        assert por_nombre["Parcial"]["nota_total"] is None


# ── Avance de la calificación ────────────────────────────────────────────────

class TestAvanceCalificacion:
    """criterios_calificados/criterios_totales: el avance real, en las tres respuestas de equipo."""

    @pytest.fixture()
    def cinco_criterios(self, db_session, curso):
        act, [crits] = _actividad(db_session, curso, [(None, [20, 20, 20, 20, 20])], tipo=TipoActividad.grupal)
        return act, crits

    def _dos_de_cinco(self, client, db_session, curso, cinco_criterios, alumnos):
        act, crits = cinco_criterios
        s1 = _seccion(db_session, curso)
        [equipo] = _crear(client, act, s1, ("E1", alumnos[:2])).json()
        _calificar(db_session, crits[:2], [1, 1], equipo=db_session.get(EquipoTrabajo, equipo["id"]))
        return act, s1, equipo

    def test_crear_trae_el_total_de_criterios_y_ninguno_calificado(self, client, db_session, curso, cinco_criterios, alumnos):
        act, _ = cinco_criterios
        [equipo] = _crear(client, act, _seccion(db_session, curso), ("E1", alumnos[:2])).json()
        assert (equipo["criterios_calificados"], equipo["criterios_totales"]) == (0, 5)

    def test_listar_con_dos_de_cinco(self, client, db_session, curso, cinco_criterios, alumnos):
        act, s1, _ = self._dos_de_cinco(client, db_session, curso, cinco_criterios, alumnos)
        [equipo] = client.get(_url(act, s1)).json()
        assert (equipo["criterios_calificados"], equipo["criterios_totales"]) == (2, 5)
        assert equipo["calificado"] is False

    def test_editar_con_dos_de_cinco(self, client, db_session, curso, cinco_criterios, alumnos):
        _, _, equipo = self._dos_de_cinco(client, db_session, curso, cinco_criterios, alumnos)
        resp = client.put(f"/equipos/{equipo['id']}", json={"nombre": "Renombrado"})
        assert resp.status_code == 200
        assert (resp.json()["criterios_calificados"], resp.json()["criterios_totales"]) == (2, 5)

    def test_actividad_sin_rubrica_tiene_cero_criterios(self, client, db_session, curso, alumnos):
        act, _ = _actividad(db_session, curso, [], tipo=TipoActividad.grupal)
        [equipo] = _crear(client, act, _seccion(db_session, curso), ("E1", alumnos[:1])).json()
        assert (equipo["criterios_calificados"], equipo["criterios_totales"]) == (0, 0)
        assert equipo["calificado"] is False


# ── Modo de calificación ─────────────────────────────────────────────────────

def _modo(client, actividad, seccion):
    return client.get(f"/actividades/{actividad.id}/modo-calificacion/{seccion.id}")


class TestModoCalificacion:
    def test_grupal_lista_equipos_y_cuenta_calificados(self, client, db_session, curso, grupal, alumnos):
        act, crits = grupal
        s1 = _seccion(db_session, curso)
        e1, _ = _crear(client, act, s1, ("E1", alumnos[:2]), ("E2", [alumnos[2]])).json()
        _calificar(db_session, crits, [1, 0], equipo=db_session.get(EquipoTrabajo, e1["id"]))

        datos = _modo(client, act, s1).json()
        assert (datos["tipo"], datos["total"], datos["calificados"]) == ("grupal", 2, 1)
        por_nombre = {i["nombre"]: i for i in datos["items"]}
        assert float(por_nombre["E1"]["nota_total"]) == 2.0  # 40 % de 5.0
        assert len(por_nombre["E1"]["miembros"]) == 2
        assert por_nombre["E2"]["calificado"] is False

    def test_individual_lista_estudiantes_ordenados(self, client, db_session, curso):
        act, [crits] = _actividad(db_session, curso, [(None, [100])])
        beto = _estudiante(db_session, curso, "Beto")
        ana = _estudiante(db_session, curso, "Ana")
        _calificar(db_session, crits, [1], estudiante=beto)

        datos = _modo(client, act, _seccion(db_session, curso)).json()
        assert (datos["tipo"], datos["total"], datos["calificados"]) == ("individual", 2, 1)
        assert [i["nombre"] for i in datos["items"]] == ["Ana", "Beto"]
        assert [i["id"] for i in datos["items"][0]["miembros"]] == [ana.id]
        assert float(datos["items"][1]["nota_total"]) == 5.0

    def test_actividad_sin_criterios_nadie_esta_calificado(self, client, db_session, curso):
        act, _ = _actividad(db_session, curso, [])
        _estudiante(db_session, curso, "Ana")
        datos = _modo(client, act, _seccion(db_session, curso)).json()
        assert datos["calificados"] == 0
        assert datos["items"][0]["calificado"] is False
