"""
Endpoints de la rúbrica (routers/criterios.py) vistos por HTTP: lo que no cubren
test_rubrica_abet, test_import_excel ni test_criterios_validation. Fija los mensajes
exactos de cada error y que ninguna validación deja cambios a medias.

Reutiliza las fixtures de SQLite en memoria y los helpers de test_rubrica_abet.
"""
import pytest

from app.models import Actividad, Curso
from app.models.actividad import TipoActividad
from tests.test_catalogo_ra_abet import client, db_session  # noqa: F401 (fixtures)
from tests.test_import_excel import _subir_xlsx, _xlsx
from tests.test_rubrica_abet import _calificar, _ra_curso, _rubrica, actividad  # noqa: F401 (fixture)

ACTIVIDAD_NO_ENCONTRADA = "Actividad no encontrada"
ACTIVIDAD_SIN_PERMISO = "No tiene permiso sobre esta actividad"
CON_CALIFICACIONES = "No se puede modificar la rúbrica de 'Lab 1' porque ya tiene calificaciones registradas."
EXCEL_VALIDO = _xlsx([("Aspecto", "Criterio", "%Criterio"), ("Diseño", "A", 100)])


def _detalle(resp):
    return resp.status_code, resp.json()["detail"]


def _aspectos(client, actividad):
    return client.get(f"/actividades/{actividad.id}/criterios").json()["aspectos"]


# (método, ruta con {id}, kwargs) de los 4 endpoints que reciben la actividad
POR_ACTIVIDAD = [
    ("get", "/actividades/{id}/criterios", {}),
    ("put", "/actividades/{id}/criterios", {"json": _rubrica(None)}),
    ("post", "/actividades/{id}/criterios/importar-excel", {"files": _subir_xlsx(EXCEL_VALIDO)}),
    ("patch", "/actividades/{id}/aspectos/1/codigo-abet", {"json": {"codigo_abet": None}}),
]
IDS = ["obtener", "reemplazar", "importar-excel", "vincular"]


@pytest.mark.parametrize("metodo,ruta,kwargs", POR_ACTIVIDAD, ids=IDS)
def test_actividad_inexistente_404(client, metodo, ruta, kwargs):
    resp = getattr(client, metodo)(ruta.format(id=99999), **kwargs)
    assert _detalle(resp) == (404, ACTIVIDAD_NO_ENCONTRADA)


@pytest.mark.parametrize("metodo,ruta,kwargs", POR_ACTIVIDAD, ids=IDS)
def test_actividad_de_otro_docente_403(client, db_session, metodo, ruta, kwargs):
    ajeno = Curso(nombre="Ajena", codigo="A-1", periodo="2026-2", docente_email="otro@uao.edu.co")
    db_session.add(ajeno)
    db_session.flush()
    act = Actividad(nombre="Ajena", tipo=TipoActividad.individual, peso_nota_final=10, curso_id=ajeno.id)
    db_session.add(act)
    db_session.commit()
    resp = getattr(client, metodo)(ruta.format(id=act.id), **kwargs)
    assert _detalle(resp) == (403, ACTIVIDAD_SIN_PERMISO)


# ── Obtener ──────────────────────────────────────────────────────────────────

def test_obtener_con_total_y_sin_calificaciones(client, actividad):
    client.put(f"/actividades/{actividad.id}/criterios", json=_rubrica("2.1.1", None))
    cuerpo = client.get(f"/actividades/{actividad.id}/criterios").json()
    assert float(cuerpo["total_peso"]) == 100
    assert cuerpo["tiene_calificaciones"] is False
    assert [a["codigo_abet"] for a in cuerpo["aspectos"]] == ["2.1.1", None]


# ── Reemplazar: cada validación, con su mensaje y sin cambios ────────────────

class TestReemplazar:
    @pytest.fixture()
    def con_rubrica(self, client, actividad):
        client.put(f"/actividades/{actividad.id}/criterios", json=_rubrica(None))
        return actividad

    def test_pesos_que_no_suman_100(self, client, db_session, con_rubrica):
        payload = {"aspectos": [{"nombre": "A", "orden": 0, "codigo_abet": "2.1.1", "criterios": [
            {"texto": "x", "peso_porcentaje": 60, "orden": 0},
            {"texto": "y", "peso_porcentaje": 30, "orden": 1},
        ]}]}
        resp = client.put(f"/actividades/{con_rubrica.id}/criterios", json=payload)
        assert _detalle(resp) == (422, "Los criterios suman 90%. Deben sumar exactamente 100%.")
        assert [a["nombre"] for a in _aspectos(client, con_rubrica)] == ["Aspecto 0"]
        assert _ra_curso(db_session, con_rubrica) == ["RA1: texto antiguo"]

    def test_codigo_inexistente(self, client, db_session, con_rubrica):
        resp = client.put(f"/actividades/{con_rubrica.id}/criterios", json=_rubrica("9.9.9"))
        assert _detalle(resp) == (422, "El código ABET '9.9.9' no existe en el catálogo de Student Outcomes")
        assert [a["nombre"] for a in _aspectos(client, con_rubrica)] == ["Aspecto 0"]

    def test_supera_el_maximo_de_ra_sin_tocar_nada(self, client, db_session, con_rubrica):
        curso = db_session.get(Curso, con_rubrica.curso_id)
        viejos = [f"viejo {i}" for i in range(10)]
        curso.ra_abet = viejos
        db_session.commit()
        resp = client.put(f"/actividades/{con_rubrica.id}/criterios", json=_rubrica("2.1.1", "4.1.1"))
        assert _detalle(resp) == (
            422,
            "Vincular este código agregaría 2.1, 4.1 a la asignatura 'Redes', que ya tiene 10 de 10 RA ABET. "
            "Quita alguno en Editar asignatura.",
        )
        assert [a["codigo_abet"] for a in _aspectos(client, con_rubrica)] == [None]
        assert _ra_curso(db_session, con_rubrica) == viejos

    def test_con_calificaciones_409(self, client, db_session, con_rubrica):
        _calificar(db_session, con_rubrica)
        resp = client.put(f"/actividades/{con_rubrica.id}/criterios", json=_rubrica("2.1.1"))
        assert _detalle(resp) == (409, CON_CALIFICACIONES)


# ── Importar desde Excel ─────────────────────────────────────────────────────

class TestImportarExcel:
    def test_columnas_faltantes_mensaje_completo(self, client, actividad):
        contenido = _xlsx([("Aspecto", "Criterio"), ("Diseño", "A")])
        resp = client.post(f"/actividades/{actividad.id}/criterios/importar-excel", files=_subir_xlsx(contenido))
        assert _detalle(resp) == (422, "El archivo debe tener al menos 3 columnas: Aspecto, Criterio, %Criterio")

    def test_con_calificaciones_409(self, client, db_session, actividad):
        client.put(f"/actividades/{actividad.id}/criterios", json=_rubrica(None))
        _calificar(db_session, actividad)
        resp = client.post(
            f"/actividades/{actividad.id}/criterios/importar-excel", files=_subir_xlsx(EXCEL_VALIDO)
        )
        assert _detalle(resp) == (409, CON_CALIFICACIONES)


# ── Vincular código ABET ─────────────────────────────────────────────────────

class TestVincular:
    @pytest.fixture()
    def aspecto_id(self, client, actividad):
        client.put(f"/actividades/{actividad.id}/criterios", json=_rubrica(None))
        return _aspectos(client, actividad)[0]["id"]

    def _url(self, actividad, aspecto_id):
        return f"/actividades/{actividad.id}/aspectos/{aspecto_id}/codigo-abet"

    def test_aspecto_inexistente_404(self, client, actividad, aspecto_id):
        resp = client.patch(self._url(actividad, 99999), json={"codigo_abet": "2.1.1"})
        assert _detalle(resp) == (404, "Aspecto no encontrado en esta actividad")

    def test_codigo_inexistente(self, client, actividad, aspecto_id):
        resp = client.patch(self._url(actividad, aspecto_id), json={"codigo_abet": "9.9.9"})
        assert _detalle(resp) == (422, "El código ABET '9.9.9' no existe en el catálogo de Student Outcomes")

    def test_codigo_de_un_ra(self, client, actividad, aspecto_id):
        resp = client.patch(self._url(actividad, aspecto_id), json={"codigo_abet": "2.1"})
        assert _detalle(resp) == (
            422, "'2.1' es un Resultado de Aprendizaje, no un Criterio — usa un código como 2.1.1"
        )

    def test_supera_el_maximo_de_ra_sin_tocar_nada(self, client, db_session, actividad, aspecto_id):
        curso = db_session.get(Curso, actividad.curso_id)
        viejos = [f"viejo {i}" for i in range(10)]
        curso.ra_abet = viejos
        db_session.commit()
        resp = client.patch(self._url(actividad, aspecto_id), json={"codigo_abet": "2.1.1"})
        assert _detalle(resp) == (
            422,
            "Vincular este código agregaría 2.1 a la asignatura 'Redes', que ya tiene 10 de 10 RA ABET. "
            "Quita alguno en Editar asignatura.",
        )
        assert _aspectos(client, actividad)[0]["codigo_abet"] is None
        assert _ra_curso(db_session, actividad) == viejos
