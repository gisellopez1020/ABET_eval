"""
Catálogo RA ABET (routers/catalogo.py) visto por HTTP: lo que no cubren
test_catalogo_ra_abet ni test_catalogo_jerarquia. Fija los mensajes exactos de
cada error, el orden de los chequeos al eliminar y que importar es atómico
también si algo falla al escribir (no solo al validar).

Reutiliza las fixtures de SQLite en memoria.
"""
import pytest
from fastapi.testclient import TestClient

from app.repositories.ra_abet import RaAbetRepository
from tests.test_catalogo_jerarquia import _codigos, _crit
from tests.test_catalogo_ra_abet import _crear_curso, _ra, client, db_session  # noqa: F401 (fixtures)
from tests.test_reportes import _actividad

URL = "/catalogo/ra-abet"


def _detalle(resp):
    return resp.status_code, resp.json()["detail"]


@pytest.fixture()
def jerarquia(client):
    """RA 2.1 con su Criterio 2.1.1, y el RA 2.2 sin Criterios."""
    client.post(URL, json=_ra("2.1"))
    client.post(URL, json=_crit("2.1.1", "2.1", 1))
    client.post(URL, json=_ra("2.2"))


# ── 404 y 409 de duplicado ───────────────────────────────────────────────────

@pytest.mark.parametrize("metodo,cuerpo", [("put", {"descripcion": "X"}), ("delete", None)], ids=["editar", "eliminar"])
def test_codigo_inexistente_404(client, metodo, cuerpo):
    resp = getattr(client, metodo)(f"{URL}/9.9", **({"json": cuerpo} if cuerpo else {}))
    assert _detalle(resp) == (404, "El código '9.9' no existe en el catálogo")


def test_crear_duplicado_409(client, jerarquia):
    assert _detalle(client.post(URL, json=_ra("2.1"))) == (409, "El código '2.1' ya existe en el catálogo")


# ── Padre del Criterio: al crear y al editar ─────────────────────────────────

PADRE_INEXISTENTE = "El RA padre '9.1' no existe en el catálogo"
PADRE_ES_CRITERIO = "'2.1.1' es un Criterio y no puede tener Criterios hijos (solo se permiten 2 niveles)"


class TestPadre:
    def test_crear_con_padre_inexistente(self, client, jerarquia):
        assert _detalle(client.post(URL, json=_crit("9.1.1", "9.1", 1))) == (422, PADRE_INEXISTENTE)

    def test_crear_con_padre_que_es_criterio(self, client, jerarquia):
        assert _detalle(client.post(URL, json=_crit("2.1.1.1", "2.1.1", 1))) == (422, PADRE_ES_CRITERIO)

    def test_mover_a_un_padre_inexistente(self, client, jerarquia):
        resp = client.put(f"{URL}/2.1.1", json={"codigo_padre": "9.1", "peso": 0.5})
        assert _detalle(resp) == (422, PADRE_INEXISTENTE)
        assert client.get(URL).json()[1]["codigo_padre"] == "2.1"

    def test_mover_bajo_un_criterio(self, client, jerarquia):
        client.post(URL, json=_crit("2.1.2", "2.1", 1))
        resp = client.put(f"{URL}/2.1.2", json={"codigo_padre": "2.1.1", "peso": 0.5})
        assert _detalle(resp) == (422, PADRE_ES_CRITERIO)


# ── Cambio de nivel al editar ────────────────────────────────────────────────

@pytest.mark.parametrize("codigo,cuerpo", [
    ("2.2", {"codigo_padre": "2.1", "peso": 0.5}),
    ("2.1.1", {"codigo_padre": None, "peso": None}),
], ids=["ra_a_criterio", "criterio_a_ra"])
def test_cambio_de_nivel_422(client, jerarquia, codigo, cuerpo):
    resp = client.put(f"{URL}/{codigo}", json=cuerpo)
    assert _detalle(resp) == (
        422,
        f"'{codigo}' no puede cambiar de nivel (Resultado de Aprendizaje <-> Criterio); elimínelo y créelo de nuevo",
    )


# ── Importar ─────────────────────────────────────────────────────────────────

class TestImportar:
    def test_varios_errores_en_un_solo_mensaje_y_no_guarda_nada(self, client, jerarquia):
        items = [
            _crit("2.2", "2.1", 1),          # 2.2 es un RA en la BD
            _ra("5.1"),                      # válido, pero no debe quedar creado
            _crit("3.1.1", "3.1", 1),        # su RA no existe en ninguna parte
            _crit("2.1.5", "2.1.1", 1),      # su padre es un Criterio
        ]
        resp = client.post(f"{URL}/importar", json={"items": items})
        assert _detalle(resp) == (
            422,
            "No se importó nada: "
            "'2.2' cambiaría de nivel (Resultado de Aprendizaje <-> Criterio); "
            "el RA padre '3.1' de '3.1.1' no existe; "
            "el padre '2.1.1' de '2.1.5' es un Criterio (solo se permiten 2 niveles)",
        )
        assert _codigos(client) == ["2.1", "2.1.1", "2.2"]

    def test_falla_al_escribir_un_criterio_deshace_todo_el_envio(self, client, jerarquia, monkeypatch):
        """
        La validación pasa, pero la inserción del Criterio falla (simulado): los RA del
        mismo envío ya escritos con flush no quedan, y el RA existente actualizado vuelve
        a su valor anterior.
        """
        agregar = RaAbetRepository.agregar

        def falla_con_criterios(self, ra):
            if ra.codigo_padre is not None:
                raise RuntimeError("falla simulada al insertar un Criterio")
            return agregar(self, ra)

        monkeypatch.setattr(RaAbetRepository, "agregar", falla_con_criterios)
        items = [_ra("2.2", descripcion="Cambiada"), _ra("5.1"), _crit("5.1.1", "5.1", 1)]
        resp = TestClient(client.app, raise_server_exceptions=False).post(f"{URL}/importar", json={"items": items})
        assert resp.status_code == 500

        monkeypatch.undo()
        catalogo = {r["codigo"]: r for r in client.get(URL).json()}
        assert sorted(catalogo) == ["2.1", "2.1.1", "2.2"]
        assert catalogo["2.2"]["descripcion"] == "Descripción 2.2"


# ── Eliminar: mensajes y orden de los chequeos ───────────────────────────────

class TestEliminar:
    @pytest.mark.parametrize("cantidad,texto", [(1, "1 criterio"), (2, "2 criterios")])
    def test_con_criterios(self, client, cantidad, texto):
        client.post(URL, json=_ra("2.1"))
        for i in range(1, cantidad + 1):
            client.post(URL, json=_crit(f"2.1.{i}", "2.1", 1))
        resp = client.delete(f"{URL}/2.1")
        assert _detalle(resp) == (409, f"No se puede eliminar '2.1' porque tiene {texto}; elimínelos primero.")

    @pytest.mark.parametrize("cantidad,texto", [(1, "1 curso"), (2, "2 cursos")])
    def test_en_uso_por_cursos(self, client, db_session, cantidad, texto):
        client.post(URL, json=_ra("2.1"))
        for _ in range(cantidad):
            _crear_curso(db_session, ["2.1"])
        resp = client.delete(f"{URL}/2.1")
        assert _detalle(resp) == (409, f"No se puede eliminar '2.1' porque está en uso por {texto}.")

    @pytest.mark.parametrize("cantidad,texto", [(1, "1 aspecto"), (2, "2 aspectos")])
    def test_vinculado_a_aspectos(self, client, db_session, jerarquia, cantidad, texto):
        _actividad(db_session, _crear_curso(db_session, []), [("2.1.1", [100 // cantidad])] * cantidad)
        resp = client.delete(f"{URL}/2.1.1")
        assert _detalle(resp) == (
            409, f"No se puede eliminar '2.1.1' porque está vinculado a {texto} de rúbrica."
        )
        assert "2.1.1" in _codigos(client)

    def test_criterios_se_revisan_antes_que_cursos(self, client, db_session, jerarquia):
        _crear_curso(db_session, ["2.1"])
        assert "tiene 1 criterio" in client.delete(f"{URL}/2.1").json()["detail"]

    def test_cursos_se_revisan_antes_que_aspectos(self, client, db_session, jerarquia):
        curso = _crear_curso(db_session, ["2.1.1"])  # dato antiguo: un curso con un Criterio
        _actividad(db_session, curso, [("2.1.1", [100])])
        assert "en uso por 1 curso" in client.delete(f"{URL}/2.1.1").json()["detail"]
