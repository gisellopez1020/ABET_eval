"""
Mensajes exactos de los errores de routers/reportes.py vistos por HTTP, en los 4
endpoints: lo que test_reportes y test_estadisticas solo comprueban por código. Fija
también que el reporte por curso no valida seccion_id (solo filtra) y que el detalle no
llega a llamar a Google Drive si la verificación falla. Esos dos archivos no se modifican.

Reutiliza las fixtures de test_reportes (SQLite en memoria).
"""
import pytest

from app.config import settings
from app.models import Curso
from app.services import google_drive
from tests.test_calificaciones_lectura import _curso_ajeno
from tests.test_catalogo_ra_abet import client, db_session  # noqa: F401 (fixtures)
from tests.test_reportes import _actividad, _calificar, _estudiante, _seccion, curso  # noqa: F401


def _detalle(resp):
    return resp.status_code, resp.json()["detail"]


def _pedir(client, endpoint, curso_id, actividad_id, seccion_id=None):
    base = f"/reportes/abet/{curso_id}"
    params = {"seccion_id": seccion_id} if seccion_id is not None else {}
    if endpoint == "curso":
        return client.get(base, params=params)
    url = f"{base}/actividad/{actividad_id}"
    if endpoint == "actividad":
        return client.get(url, params=params)
    if endpoint == "resumen":
        return client.get(f"{url}/resumen-xlsx", params=params)
    return client.post(f"{url}/detalle-xlsx", json=params)


TODOS = ["curso", "actividad", "resumen", "detalle"]
POR_ACTIVIDAD = ["actividad", "resumen", "detalle"]


def _otro_curso_propio(db_session):
    otro = Curso(nombre="Otro", codigo="O-1", periodo="2026-2", docente_email="profesor.test@uao.edu.co", ra_abet=[])
    db_session.add(otro)
    db_session.commit()
    return otro


# ── Curso ────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("endpoint", TODOS)
def test_curso_inexistente_404(client, endpoint):
    assert _detalle(_pedir(client, endpoint, 99999, 1)) == (404, "Curso no encontrado")


@pytest.mark.parametrize("endpoint", TODOS)
def test_curso_de_otro_docente_403(client, db_session, endpoint):
    ajeno = _curso_ajeno(db_session)
    act, _ = _actividad(db_session, ajeno, [(None, [100])])
    assert _detalle(_pedir(client, endpoint, ajeno.id, act.id)) == (403, "No tiene permiso sobre este curso")


# ── Actividad ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("cual", ["inexistente", "de_otro_curso"])
@pytest.mark.parametrize("endpoint", POR_ACTIVIDAD)
def test_actividad_fuera_del_curso_404(client, db_session, curso, endpoint, cual):
    if cual == "inexistente":
        actividad_id = 99999
    else:
        actividad_id = _actividad(db_session, _otro_curso_propio(db_session), [(None, [100])])[0].id
    resp = _pedir(client, endpoint, curso.id, actividad_id)
    assert _detalle(resp) == (404, "Actividad no encontrada en este curso")


# ── Sección ──────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("cual", ["inexistente", "de_otro_curso"])
@pytest.mark.parametrize("endpoint", POR_ACTIVIDAD)
def test_seccion_fuera_del_curso_404(client, db_session, curso, endpoint, cual):
    act, _ = _actividad(db_session, curso, [("2.1.1", [100])])
    seccion_id = 9999 if cual == "inexistente" else _seccion(db_session, _curso_ajeno(db_session)).id
    resp = _pedir(client, endpoint, curso.id, act.id, seccion_id)
    assert _detalle(resp) == (404, "Sección no encontrada en este curso")


def test_reporte_por_curso_no_valida_la_seccion_solo_filtra(client, db_session, curso):
    """Una sección de otro curso no da 404 en el reporte del curso: deja los totales en 0."""
    act, [crits] = _actividad(db_session, curso, [("2.1.1", [100])])
    _calificar(db_session, crits, [1], estudiante=_estudiante(db_session, curso, "ANA"))
    ajena = _seccion(db_session, _curso_ajeno(db_session))

    resp = _pedir(client, "curso", curso.id, None, ajena.id)
    assert resp.status_code == 200
    assert [c["total"] for c in resp.json()["criterios"]] == [0]
    assert _pedir(client, "curso", curso.id, None).json()["criterios"][0]["total"] == 1


# ── Drive ────────────────────────────────────────────────────────────────────

def test_detalle_no_llama_a_drive_si_la_verificacion_falla(client, db_session, curso, monkeypatch):
    llamadas = []
    monkeypatch.setattr(settings, "skip_auth", False)
    monkeypatch.setattr(google_drive, "obtener_tokens_drive", lambda email: llamadas.append(email))
    assert _pedir(client, "detalle", curso.id, 99999).status_code == 404
    assert llamadas == []
