"""
Escritura y resumen de calificaciones (routers/calificaciones.py): resumen por sección,
guardado completo (crear y reemplazar), edición de una calificación y calificación masiva
por equipos, que no sobrescribe lo que el docente ya calificó a mano.

La lectura por equipo y por estudiante está en test_calificaciones_lectura.
Reutiliza las fixtures y utilidades de test_reportes (SQLite en memoria).
"""
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.models import Calificacion, EquipoTrabajo
from app.models.actividad import TipoActividad
from tests.test_catalogo_ra_abet import MOCK_USER, client, db_session  # noqa: F401 (fixtures)
from tests.test_calificaciones_lectura import _curso_ajeno, _equipo
from tests.test_reportes import _actividad, _calificar, _estudiante, _seccion, curso  # noqa: F401


def _guardar(client, actividad, criterios, valores, estudiante=None, equipo=None):
    return client.post("/calificaciones", json={
        "actividad_id": actividad.id,
        "criterios": [{"criterio_id": c.id, "valor": v} for c, v in zip(criterios, valores)],
        "equipo_id": equipo.id if equipo else None,
        "estudiante_id": estudiante.id if estudiante else None,
    })


def _filas(db_session, **filtro):
    """{criterio_id: (valor, nota_calculada)} de un equipo o estudiante."""
    db_session.expire_all()
    return {
        c.criterio_id: (c.valor, c.nota_calculada)
        for c in db_session.query(Calificacion).filter_by(**filtro).all()
    }


# ── Resumen por sección ──────────────────────────────────────────────────────

def _resumen(client, actividad, seccion):
    return client.get(f"/actividades/{actividad.id}/calificaciones/{seccion.id}")


class TestResumen:
    def test_grupal(self, client, db_session, curso):
        act, [crits] = _actividad(db_session, curso, [(None, [40, 60])], tipo=TipoActividad.grupal)
        completo = _equipo(db_session, curso, act, "Completo")
        parcial = _equipo(db_session, curso, act, "Parcial")
        _calificar(db_session, crits, [1, 0], equipo=completo)
        _calificar(db_session, crits[:1], [1], equipo=parcial)

        resp = _resumen(client, act, _seccion(db_session, curso))
        assert resp.status_code == 200
        por_nombre = {r["nombre"]: r for r in resp.json()}
        assert por_nombre["Completo"]["equipo_id"] == completo.id
        assert (por_nombre["Completo"]["criterios_calificados"], por_nombre["Completo"]["criterios_totales"]) == (2, 2)
        assert por_nombre["Completo"]["calificado"] is True
        assert float(por_nombre["Completo"]["nota_total"]) == 2.0
        # Parcial: se informa el avance pero no la nota
        assert (por_nombre["Parcial"]["criterios_calificados"], por_nombre["Parcial"]["calificado"]) == (1, False)
        assert por_nombre["Parcial"]["nota_total"] is None

    def test_individual_ordenado_por_nombre(self, client, db_session, curso):
        act, [crits] = _actividad(db_session, curso, [(None, [100])])
        beto = _estudiante(db_session, curso, "Beto")
        ana = _estudiante(db_session, curso, "Ana")
        _calificar(db_session, crits, [1], estudiante=beto)

        datos = _resumen(client, act, _seccion(db_session, curso)).json()
        assert [(r["nombre"], r["estudiante_id"]) for r in datos] == [("Ana", ana.id), ("Beto", beto.id)]
        assert (datos[0]["calificado"], datos[0]["nota_total"]) == (False, None)
        assert (datos[1]["calificado"], float(datos[1]["nota_total"])) == (True, 5.0)

    def test_seccion_de_otro_curso_404(self, client, db_session, curso):
        act, _ = _actividad(db_session, curso, [(None, [100])])
        assert _resumen(client, act, _seccion(db_session, _curso_ajeno(db_session))).status_code == 404

    def test_actividad_de_otro_docente_403(self, client, db_session):
        ajeno = _curso_ajeno(db_session)
        act, _ = _actividad(db_session, ajeno, [(None, [100])])
        assert _resumen(client, act, _seccion(db_session, ajeno)).status_code == 403

    def test_actividad_inexistente_404(self, client, db_session, curso):
        assert client.get(f"/actividades/99999/calificaciones/{_seccion(db_session, curso).id}").status_code == 404


# ── Guardar ──────────────────────────────────────────────────────────────────

class TestGuardar:
    def test_estudiante_calcula_la_nota_parcial(self, client, db_session, curso):
        act, [crits] = _actividad(db_session, curso, [(None, [40, 60])])
        ana = _estudiante(db_session, curso, "Ana")

        resp = _guardar(client, act, crits, [1, 0], estudiante=ana)
        assert resp.status_code == 201
        assert _filas(db_session, estudiante_id=ana.id) == {
            crits[0].id: (1, Decimal("2.0")),  # 40 % de 5.0
            crits[1].id: (0, Decimal("0")),
        }

    def test_equipo(self, client, db_session, curso):
        act, [crits] = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
        equipo = _equipo(db_session, curso, act)
        resp = _guardar(client, act, crits, [1], equipo=equipo)
        assert resp.status_code == 201
        assert [(r["equipo_id"], r["estudiante_id"]) for r in resp.json()] == [(equipo.id, None)]
        assert _filas(db_session, equipo_id=equipo.id) == {crits[0].id: (1, Decimal("5.0"))}

    def test_guardar_de_nuevo_reemplaza_sin_duplicar(self, client, db_session, curso):
        act, [crits] = _actividad(db_session, curso, [(None, [40, 60])])
        ana = _estudiante(db_session, curso, "Ana")
        primera = _guardar(client, act, crits, [1, 1], estudiante=ana).json()

        segunda = _guardar(client, act, crits, [0, 1], estudiante=ana).json()
        assert [r["id"] for r in segunda] == [r["id"] for r in primera]
        assert _filas(db_session, estudiante_id=ana.id) == {
            crits[0].id: (0, Decimal("0")),
            crits[1].id: (1, Decimal("3.0")),
        }

    def test_criterio_de_otra_actividad_400(self, client, db_session, curso):
        act, _ = _actividad(db_session, curso, [(None, [100])])
        _, [ajenos] = _actividad(db_session, curso, [(None, [100])])
        ana = _estudiante(db_session, curso, "Ana")
        resp = _guardar(client, act, ajenos, [1], estudiante=ana)
        assert resp.status_code == 400
        assert "no pertenece a esta actividad" in resp.json()["detail"]

    def test_equipo_de_otra_actividad_400(self, client, db_session, curso):
        act, [crits] = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
        otra, _ = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
        resp = _guardar(client, act, crits, [1], equipo=_equipo(db_session, curso, otra))
        assert resp.status_code == 400
        assert resp.json()["detail"] == "El equipo no pertenece a esta actividad"

    def test_estudiante_de_otro_curso_400(self, client, db_session, curso):
        act, [crits] = _actividad(db_session, curso, [(None, [100])])
        zoe = _estudiante(db_session, _curso_ajeno(db_session), "Zoe")
        resp = _guardar(client, act, crits, [1], estudiante=zoe)
        assert resp.status_code == 400
        assert resp.json()["detail"] == "El estudiante no pertenece a este curso"

    def test_estudiante_inexistente_404(self, client, db_session, curso):
        act, [crits] = _actividad(db_session, curso, [(None, [100])])
        resp = client.post("/calificaciones", json={
            "actividad_id": act.id, "estudiante_id": 99999,
            "criterios": [{"criterio_id": crits[0].id, "valor": 1}],
        })
        assert resp.status_code == 404

    def test_actividad_de_otro_docente_403(self, client, db_session):
        ajeno = _curso_ajeno(db_session)
        act, [crits] = _actividad(db_session, ajeno, [(None, [100])])
        zoe = _estudiante(db_session, ajeno, "Zoe")
        assert _guardar(client, act, crits, [1], estudiante=zoe).status_code == 403
        assert _filas(db_session, estudiante_id=zoe.id) == {}

    def test_valor_no_binario_422(self, client, db_session, curso):
        act, [crits] = _actividad(db_session, curso, [(None, [100])])
        ana = _estudiante(db_session, curso, "Ana")
        assert _guardar(client, act, crits, [2], estudiante=ana).status_code == 422

    @pytest.mark.parametrize("entidades", [
        {"equipo_id": None, "estudiante_id": None},
        {"equipo_id": 1, "estudiante_id": 1},
        {},  # ambos omitidos: antes el validador no corría y el insert daba 500
    ], ids=["ambos-null", "ambos", "ninguno-omitido"])
    def test_exactamente_un_equipo_o_estudiante_422(self, client, db_session, curso, entidades):
        act, [crits] = _actividad(db_session, curso, [(None, [100])])
        # raise_server_exceptions=False: si vuelve el 500, que se vea como status y no como excepción
        resp = TestClient(client.app, raise_server_exceptions=False).post("/calificaciones", json={
            "actividad_id": act.id, **entidades,
            "criterios": [{"criterio_id": crits[0].id, "valor": 1}],
        })
        assert resp.status_code == 422


# ── Editar ───────────────────────────────────────────────────────────────────

class TestEditar:
    def test_recalcula_la_nota(self, client, db_session, curso):
        act, [crits] = _actividad(db_session, curso, [(None, [40, 60])])
        ana = _estudiante(db_session, curso, "Ana")
        _calificar(db_session, crits, [0, 0], estudiante=ana)
        cal = db_session.query(Calificacion).filter_by(criterio_id=crits[1].id).one()

        resp = client.patch(f"/calificaciones/{cal.id}", json={"valor": 1})
        assert resp.status_code == 200
        assert (resp.json()["valor"], float(resp.json()["nota_calculada"])) == (1, 3.0)

    def test_valor_no_binario_422(self, client, db_session, curso):
        act, [crits] = _actividad(db_session, curso, [(None, [100])])
        _calificar(db_session, crits, [0], estudiante=_estudiante(db_session, curso, "Ana"))
        cal = db_session.query(Calificacion).one()
        assert client.patch(f"/calificaciones/{cal.id}", json={"valor": 5}).status_code == 422

    def test_inexistente_404(self, client):
        assert client.patch("/calificaciones/99999", json={"valor": 1}).status_code == 404

    def test_de_otro_docente_403(self, client, db_session):
        ajeno = _curso_ajeno(db_session)
        act, [crits] = _actividad(db_session, ajeno, [(None, [100])])
        _calificar(db_session, crits, [0], estudiante=_estudiante(db_session, ajeno, "Zoe"))
        cal = db_session.query(Calificacion).one()

        assert client.patch(f"/calificaciones/{cal.id}", json={"valor": 1}).status_code == 403
        db_session.expire_all()
        assert db_session.get(Calificacion, cal.id).valor == 0


# ── Masiva ───────────────────────────────────────────────────────────────────

def _masivo(client, actividad, seccion, criterios, valores):
    return client.post(f"/actividades/{actividad.id}/calificaciones/masivo", json={
        "seccion_id": seccion.id,
        "criterios": [{"criterio_id": c.id, "valor": v} for c, v in zip(criterios, valores)],
    })


class TestMasivo:
    def test_completo_intacto_parcial_solo_recibe_lo_que_falta_vacio_recibe_todo(self, client, db_session, curso):
        act, [crits] = _actividad(db_session, curso, [(None, [20, 30, 50])], tipo=TipoActividad.grupal)
        completo = _equipo(db_session, curso, act, "Completo")
        parcial = _equipo(db_session, curso, act, "Parcial")
        vacio = _equipo(db_session, curso, act, "Vacío")
        _calificar(db_session, crits, [0, 0, 0], equipo=completo)
        _calificar(db_session, crits[:2], [0, 1], equipo=parcial)  # le falta el 3.º
        antes_completo = _filas(db_session, equipo_id=completo.id)
        antes_parcial = _filas(db_session, equipo_id=parcial.id)

        resp = _masivo(client, act, _seccion(db_session, curso), crits, [1, 1, 1])
        assert resp.status_code == 201
        assert sorted((r["equipo_id"], r["criterio_id"]) for r in resp.json()) == sorted(
            [(parcial.id, crits[2].id)] + [(vacio.id, c.id) for c in crits]
        )

        assert _filas(db_session, equipo_id=completo.id) == antes_completo
        # El parcial conserva lo que el docente puso a mano (aunque el body traiga otro valor)
        despues_parcial = _filas(db_session, equipo_id=parcial.id)
        assert {k: v for k, v in despues_parcial.items() if k in antes_parcial} == antes_parcial
        assert despues_parcial[crits[2].id] == (1, Decimal("2.5"))
        assert db_session.query(Calificacion).filter_by(equipo_id=parcial.id).count() == 3
        assert _filas(db_session, equipo_id=vacio.id) == {
            crits[0].id: (1, Decimal("1.0")),
            crits[1].id: (1, Decimal("1.5")),
            crits[2].id: (1, Decimal("2.5")),
        }

        # Ninguna nota total pasa de 5.0 (antes el parcial sumaba sus criterios dos veces)
        resumen = {r["nombre"]: r for r in client.get(
            f"/actividades/{act.id}/calificaciones/{_seccion(db_session, curso).id}"
        ).json()}
        assert float(resumen["Parcial"]["nota_total"]) == 1.5 + 2.5
        assert all(r["calificado"] for r in resumen.values())

    def test_criterio_repetido_en_el_body_se_inserta_una_vez(self, client, db_session, curso):
        act, [crits] = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
        equipo = _equipo(db_session, curso, act)
        resp = _masivo(client, act, _seccion(db_session, curso), [crits[0], crits[0]], [1, 0])
        assert len(resp.json()) == 1
        assert _filas(db_session, equipo_id=equipo.id) == {crits[0].id: (1, Decimal("5.0"))}

    def test_ignora_criterios_de_otra_actividad(self, client, db_session, curso):
        act, [crits] = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
        _, [ajenos] = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
        equipo = _equipo(db_session, curso, act)
        resp = _masivo(client, act, _seccion(db_session, curso), [ajenos[0], crits[0]], [1, 1])
        assert resp.status_code == 201
        assert _filas(db_session, equipo_id=equipo.id) == {crits[0].id: (1, Decimal("5.0"))}

    def test_solo_equipos_de_la_seccion_indicada(self, client, db_session, curso):
        act, [crits] = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
        de_s2 = EquipoTrabajo(nombre="S2", actividad_id=act.id, seccion_id=_seccion(db_session, curso, "S2").id)
        db_session.add(de_s2)
        db_session.commit()
        _equipo(db_session, curso, act)
        _masivo(client, act, _seccion(db_session, curso), crits, [1])
        assert _filas(db_session, equipo_id=de_s2.id) == {}

    def test_seccion_de_otro_curso_404(self, client, db_session, curso):
        act, [crits] = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
        assert _masivo(client, act, _seccion(db_session, _curso_ajeno(db_session)), crits, [1]).status_code == 404

    def test_actividad_de_otro_docente_403(self, client, db_session):
        ajeno = _curso_ajeno(db_session)
        act, [crits] = _actividad(db_session, ajeno, [(None, [100])], tipo=TipoActividad.grupal)
        assert _masivo(client, act, _seccion(db_session, ajeno), crits, [1]).status_code == 403
