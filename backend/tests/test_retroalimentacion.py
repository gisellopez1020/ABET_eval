"""
Endpoints de retroalimentación por equipo y por estudiante: forma de la respuesta y
errores HTTP. La lógica (capas, reuso, fallback) se prueba en test_retroalimentacion_service.

Reutiliza las fixtures y utilidades de test_reportes (SQLite en memoria).
"""
from app.config import settings
from app.models.actividad import TipoActividad
from app.services import gemini
from tests.test_calificaciones_lectura import _curso_ajeno, _equipo
from tests.test_exportar_estudiantes import _alembic_sql
from tests.test_catalogo_ra_abet import MOCK_USER, client, db_session  # noqa: F401 (fixtures)
from tests.test_reportes import _actividad, _calificar, _estudiante, curso  # noqa: F401


def _url(actividad, equipo):
    return f"/actividades/{actividad.id}/equipos/{equipo.id}/retroalimentacion"


def _url_est(actividad, estudiante):
    return f"/actividades/{actividad.id}/estudiantes/{estudiante.id}/retroalimentacion"


def test_equipo_sin_ia_devuelve_la_estructurada(client, db_session, curso):
    act, [crits] = _actividad(db_session, curso, [(None, [50, 50])], tipo=TipoActividad.grupal)
    equipo = _equipo(db_session, curso, act)
    _calificar(db_session, crits, [1, 0], equipo=equipo)

    resp = client.get(_url(act, equipo))

    assert resp.status_code == 200
    cuerpo = resp.json()
    aspecto_id = cuerpo["aspectos"][0]["aspecto_id"]
    assert cuerpo == {
        "completa": True, "fuente": "estructurada", "texto": None, "generada_en": None,
        "aspectos": [{"aspecto_id": aspecto_id, "nombre": "A0", "cumplidos": ["C0"], "por_reforzar": ["C1"]}],
    }


def test_estudiante_con_ia(client, db_session, curso, monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "key-de-prueba")
    monkeypatch.setattr(gemini, "redactar", lambda instrucciones, mensaje: "Lograste lo principal.")
    act, [crits] = _actividad(db_session, curso, [(None, [100])])
    ana = _estudiante(db_session, curso, "Ana")
    _calificar(db_session, crits, [1], estudiante=ana)

    cuerpo = client.get(_url_est(act, ana)).json()

    assert cuerpo["fuente"] == "ia" and cuerpo["texto"] == "Lograste lo principal."
    assert cuerpo["completa"] is True and cuerpo["generada_en"]


def test_incompleta(client, db_session, curso):
    act, [crits] = _actividad(db_session, curso, [(None, [50, 50])])
    ana = _estudiante(db_session, curso, "Ana")
    _calificar(db_session, crits[:1], [0], estudiante=ana)

    cuerpo = client.get(_url_est(act, ana)).json()

    assert cuerpo["completa"] is False and cuerpo["fuente"] == "estructurada"


def test_equipo_de_otra_actividad_404(client, db_session, curso):
    act, _ = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
    otra, _ = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
    equipo = _equipo(db_session, curso, otra)
    assert client.get(_url(act, equipo)).status_code == 404


def test_actividad_de_otro_docente_403(client, db_session, curso):
    ajeno = _curso_ajeno(db_session)
    act, _ = _actividad(db_session, ajeno, [(None, [100])])
    ana = _estudiante(db_session, curso, "Ana")
    assert client.get(_url_est(act, ana)).status_code == 403


def test_actividad_inexistente_404(client, db_session, curso):
    ana = _estudiante(db_session, curso, "Ana")
    assert client.get(f"/actividades/9999/estudiantes/{ana.id}/retroalimentacion").status_code == 404


# ── Migración 0010 ───────────────────────────────────────────────────────────

def test_migracion_0010_crea_la_tabla_con_unicos_planos_y_cascada():
    sql = _alembic_sql("upgrade", "0009:0010")
    assert "CREATE TABLE retroalimentaciones" in sql
    assert "CHECK ((equipo_id IS NULL) != (estudiante_id IS NULL))" in sql
    # Únicos planos, sin WHERE: NULL no choca con NULL
    assert "CONSTRAINT uq_retroalimentacion_equipo UNIQUE (actividad_id, equipo_id)" in sql
    assert "CONSTRAINT uq_retroalimentacion_estudiante UNIQUE (actividad_id, estudiante_id)" in sql
    assert "WHERE" not in sql.split("CREATE TABLE retroalimentaciones")[1].split(");")[0]
    for tabla in ("actividades", "equipos_trabajo", "estudiantes"):
        assert f"REFERENCES {tabla} (id) ON DELETE CASCADE" in sql
    assert "version_num='0010'" in sql


def test_migracion_0010_downgrade_borra_la_tabla():
    assert "DROP TABLE retroalimentaciones;" in _alembic_sql("downgrade", "0010:0009")
