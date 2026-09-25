"""
Jerarquía del catálogo RA ABET: Resultado de Aprendizaje (P.I., ej. "2.1") y
Criterio de Evaluación (ej. "2.1.1", con codigo_padre y peso). Solo 2 niveles.

Reutiliza las fixtures de SQLite en memoria (con FK activadas) de test_catalogo_ra_abet.
"""
import pytest

from tests.test_catalogo_ra_abet import _ra, client, db_session  # noqa: F401 (fixtures)


def _crit(codigo, padre, peso, **extra):
    """Criterio de Evaluación (hijo de un RA); sin competencia, la hereda del padre."""
    return {"codigo": codigo, "descripcion": f"Criterio {codigo}", "codigo_padre": padre, "peso": peso, **extra}


def _codigos(client, **params):
    return [r["codigo"] for r in client.get("/catalogo/ra-abet", params=params).json()]


class TestCrearCriterio:
    def test_hereda_competencia_y_deduce_so(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        resp = client.post("/catalogo/ra-abet", json=_crit("2.1.1", "2.1", 0.4))
        assert resp.status_code == 201
        body = resp.json()
        assert (body["codigo_padre"], body["peso"], body["competencia"], body["so"]) == ("2.1", 0.4, "Diseño", "2")

    def test_competencia_propia_se_respeta(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        resp = client.post("/catalogo/ra-abet", json=_crit("2.1.1", "2.1", 0.4, competencia="Otra"))
        assert resp.json()["competencia"] == "Otra"

    def test_padre_inexistente_422(self, client):
        resp = client.post("/catalogo/ra-abet", json=_crit("9.1.1", "9.1", 0.5))
        assert resp.status_code == 422
        assert "no existe" in resp.json()["detail"]

    def test_padre_que_es_criterio_422(self, client):
        """Solo 2 niveles: un Criterio no puede ser padre de otro."""
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        client.post("/catalogo/ra-abet", json=_crit("2.1.1", "2.1", 0.5))
        resp = client.post("/catalogo/ra-abet", json=_crit("2.1.1.1", "2.1.1", 0.5))
        assert resp.status_code == 422
        assert "2 niveles" in resp.json()["detail"]

    def test_sin_peso_422(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        assert client.post("/catalogo/ra-abet", json=_crit("2.1.1", "2.1", None)).status_code == 422

    def test_peso_sin_padre_422(self, client):
        assert client.post("/catalogo/ra-abet", json=_ra("2.1", peso=0.5)).status_code == 422

    @pytest.mark.parametrize("peso", [0, -0.1, 1.01, 40])
    def test_peso_fuera_de_rango_422(self, client, peso):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        assert client.post("/catalogo/ra-abet", json=_crit("2.1.1", "2.1", peso)).status_code == 422

    def test_peso_1_es_valido(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        assert client.post("/catalogo/ra-abet", json=_crit("2.1.1", "2.1", 1)).status_code == 201

    def test_propio_padre_422(self, client):
        assert client.post("/catalogo/ra-abet", json=_crit("2.1", "2.1", 1)).status_code == 422

    def test_ra_sin_competencia_422(self, client):
        assert client.post("/catalogo/ra-abet", json={"codigo": "2.1", "descripcion": "D"}).status_code == 422


class TestListarYEliminar:
    def test_solo_raiz(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        client.post("/catalogo/ra-abet", json=_crit("2.1.1", "2.1", 1))
        assert _codigos(client) == ["2.1", "2.1.1"]
        assert _codigos(client, solo_raiz="true") == ["2.1"]

    def test_eliminar_ra_con_criterios_409(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        client.post("/catalogo/ra-abet", json=_crit("2.1.1", "2.1", 0.5))
        client.post("/catalogo/ra-abet", json=_crit("2.1.2", "2.1", 0.5))
        resp = client.delete("/catalogo/ra-abet/2.1")
        assert resp.status_code == 409
        assert "tiene 2 criterios" in resp.json()["detail"]
        assert _codigos(client) == ["2.1", "2.1.1", "2.1.2"]

    def test_eliminar_criterio_y_luego_ra(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        client.post("/catalogo/ra-abet", json=_crit("2.1.1", "2.1", 1))
        assert client.delete("/catalogo/ra-abet/2.1.1").status_code == 204
        assert client.delete("/catalogo/ra-abet/2.1").status_code == 204


class TestEditarCriterio:
    def test_editar_peso_y_mover_a_otro_ra(self, client):
        for codigo in ["2.1", "2.2"]:
            client.post("/catalogo/ra-abet", json=_ra(codigo))
        client.post("/catalogo/ra-abet", json=_crit("2.1.1", "2.1", 0.5))
        resp = client.put("/catalogo/ra-abet/2.1.1", json={"codigo_padre": "2.2", "peso": 0.3})
        assert resp.status_code == 200
        assert (resp.json()["codigo_padre"], resp.json()["peso"]) == ("2.2", 0.3)

    def test_solo_uno_de_la_pareja_422(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        client.post("/catalogo/ra-abet", json=_crit("2.1.1", "2.1", 0.5))
        assert client.put("/catalogo/ra-abet/2.1.1", json={"peso": 0.3}).status_code == 422

    def test_null_en_campo_obligatorio_422(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        assert client.put("/catalogo/ra-abet/2.1", json={"descripcion": None}).status_code == 422

    def test_cambio_de_nivel_422(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        client.post("/catalogo/ra-abet", json=_ra("2.2"))
        client.post("/catalogo/ra-abet", json=_crit("2.1.1", "2.1", 1))
        # Criterio -> RA
        resp = client.put("/catalogo/ra-abet/2.1.1", json={"codigo_padre": None, "peso": None})
        assert resp.status_code == 422
        assert "cambiar de nivel" in resp.json()["detail"]
        # RA -> Criterio
        assert client.put("/catalogo/ra-abet/2.2", json={"codigo_padre": "2.1", "peso": 0.5}).status_code == 422

    def test_mover_bajo_un_criterio_422(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        client.post("/catalogo/ra-abet", json=_crit("2.1.1", "2.1", 0.5))
        client.post("/catalogo/ra-abet", json=_crit("2.1.2", "2.1", 0.5))
        resp = client.put("/catalogo/ra-abet/2.1.2", json={"codigo_padre": "2.1.1", "peso": 0.5})
        assert resp.status_code == 422


class TestImportarJerarquia:
    def test_criterios_antes_que_su_ra_en_el_archivo(self, client):
        items = [_crit("2.1.1", "2.1", 0.6), _crit("2.1.2", "2.1", 0.4), _ra("2.1")]
        resp = client.post("/catalogo/ra-abet/importar", json={"items": items})
        assert resp.status_code == 200
        assert resp.json() == {"creados": 3, "actualizados": 0}
        catalogo = {r["codigo"]: r for r in client.get("/catalogo/ra-abet").json()}
        assert catalogo["2.1.1"]["codigo_padre"] == "2.1"
        assert catalogo["2.1.1"]["competencia"] == "Diseño"  # heredada del RA del mismo archivo

    def test_pesos_que_no_suman_1_se_aceptan(self, client):
        """Caso real del Excel de la UAO (RA "1.2"): se importa tal cual, sin error."""
        items = [_ra("1.2"), _crit("1.2.1", "1.2", 0.3), _crit("1.2.2", "1.2", 0.3)]
        resp = client.post("/catalogo/ra-abet/importar", json={"items": items})
        assert resp.status_code == 200
        pesos = [r["peso"] for r in client.get("/catalogo/ra-abet").json() if r["codigo_padre"] == "1.2"]
        assert pesos == [0.3, 0.3]

    def test_padre_existente_en_bd(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        resp = client.post("/catalogo/ra-abet/importar", json={"items": [_crit("2.1.1", "2.1", 1)]})
        assert resp.status_code == 200

    def test_padre_inexistente_no_guarda_nada(self, client):
        items = [_ra("2.1"), _crit("9.1.1", "9.1", 1)]
        resp = client.post("/catalogo/ra-abet/importar", json={"items": items})
        assert resp.status_code == 422
        assert "'9.1'" in resp.json()["detail"]
        assert _codigos(client) == []

    def test_padre_que_es_criterio_no_guarda_nada(self, client):
        items = [_ra("2.1"), _crit("2.1.1", "2.1", 1), _crit("2.1.1.1", "2.1.1", 1)]
        resp = client.post("/catalogo/ra-abet/importar", json={"items": items})
        assert resp.status_code == 422
        assert _codigos(client) == []

    def test_cambio_de_nivel_no_guarda_nada(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        client.post("/catalogo/ra-abet", json=_ra("2.2"))
        items = [_ra("3.1"), _crit("2.2", "2.1", 1)]  # 2.2 es RA en la BD
        resp = client.post("/catalogo/ra-abet/importar", json={"items": items})
        assert resp.status_code == 422
        assert "cambiaría de nivel" in resp.json()["detail"]
        assert _codigos(client) == ["2.1", "2.2"]

    def test_reimportar_actualiza_pesos(self, client):
        client.post("/catalogo/ra-abet/importar", json={"items": [_ra("2.1"), _crit("2.1.1", "2.1", 0.5)]})
        resp = client.post("/catalogo/ra-abet/importar", json={"items": [_crit("2.1.1", "2.1", 0.8)]})
        assert resp.json() == {"creados": 0, "actualizados": 1}
        criterio = client.get("/catalogo/ra-abet").json()[1]
        assert (criterio["codigo"], criterio["peso"]) == ("2.1.1", 0.8)


class TestCursoSoloResultadosDeAprendizaje:
    def test_curso_con_codigo_de_criterio_422(self, client):
        client.post("/catalogo/ra-abet", json=_ra("2.1"))
        client.post("/catalogo/ra-abet", json=_crit("2.1.1", "2.1", 1))
        resp = client.post(
            "/cursos", json={"nombre": "C", "codigo": "C", "periodo": "2026-1", "ra_abet": ["2.1", "2.1.1"]}
        )
        assert resp.status_code == 422
        assert "no Criterios: 2.1.1" in resp.json()["detail"]
