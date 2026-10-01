"""
ReporteService (services/reportes.py) y la regla compartida curso_del_docente
(services/acceso.py) probados sin HTTP: se llama al servicio con una sesión SQLite y se
verifica el error de negocio que lanza y cuándo llama a Google Drive.
"""
import ast
from pathlib import Path

import pytest

from app.models import RaAbetCatalogo
from app.repositories.curso import CursoRepository
from app.services import reportes as modulo_reportes
from app.services.acceso import curso_del_docente
from app.services.errores import ActividadFueraDelCurso, CursoNoEncontrado, SeccionFueraDelCurso, SinPermiso
from app.services.reportes import ReporteService
from tests.test_catalogo_ra_abet import MOCK_USER, db_session  # noqa: F401 (fixtures)
from tests.test_exportar_estudiantes import _curso, _est
from tests.test_reportes import _actividad, _calificar

EMAIL = MOCK_USER["email"]


@pytest.fixture()
def servicio(db_session):
    return ReporteService(db_session)


@pytest.fixture()
def ctx(db_session):
    """Curso con S1 y S2, catálogo 2.1 / 2.1.1, una actividad con un aspecto vinculado y Ana calificada."""
    db_session.add(RaAbetCatalogo(codigo="2.1", competencia="C", descripcion="RA 2.1"))
    db_session.flush()
    db_session.add(RaAbetCatalogo(codigo="2.1.1", competencia="C", descripcion="Crit", codigo_padre="2.1", peso=1))
    db_session.commit()
    curso, [s1, s2] = _curso(db_session, secciones=("S1", "S2"))
    act, [crits] = _actividad(db_session, curso, [("2.1.1", [100])])
    _calificar(db_session, crits, [1], estudiante=_est(db_session, s1, "Ana", "1"))
    ajeno, [sa] = _curso(db_session, "Ajena", "A-1", email="otro@uao.edu.co")
    return {"curso": curso, "s1": s1, "s2": s2, "act": act, "ajeno": ajeno, "sa": sa}


@pytest.fixture()
def drive(monkeypatch):
    """Sustituye la subida a Drive del servicio y registra las llamadas."""
    llamadas = []

    def subir(email, nombre, contenido, mimetype):
        llamadas.append(nombre)
        return {"estado": "simulado", "detalle": None, "enlace": None}

    monkeypatch.setattr(modulo_reportes, "subir_archivo", subir)
    return llamadas


# ── curso_del_docente (services/acceso.py) ───────────────────────────────────

class TestCursoDelDocente:
    def test_devuelve_el_curso(self, db_session, ctx):
        assert curso_del_docente(CursoRepository(db_session), ctx["curso"].id, EMAIL) is ctx["curso"]

    def test_inexistente(self, db_session):
        with pytest.raises(CursoNoEncontrado):
            curso_del_docente(CursoRepository(db_session), 99999, EMAIL)

    def test_de_otro_docente(self, db_session, ctx):
        with pytest.raises(SinPermiso, match="^No tiene permiso sobre este curso$"):
            curso_del_docente(CursoRepository(db_session), ctx["ajeno"].id, EMAIL)


# ── Reporte por curso ────────────────────────────────────────────────────────

class TestReporteCurso:
    def test_cuenta_a_ana_en_el_criterio_y_el_ra(self, servicio, ctx):
        reporte = servicio.reporte_curso(ctx["curso"].id, EMAIL, None)
        assert [(c.codigo, c.total, c.rangos["4.0-5.0"]) for c in reporte.criterios] == [("2.1.1", 1, 1)]
        assert [(r.codigo, r.total) for r in reporte.resultados] == [("2.1", 1)]

    def test_la_seccion_solo_filtra(self, servicio, ctx):
        assert servicio.reporte_curso(ctx["curso"].id, EMAIL, ctx["s2"].id).criterios[0].total == 0
        assert servicio.reporte_curso(ctx["curso"].id, EMAIL, ctx["sa"].id).criterios[0].total == 0

    def test_curso_de_otro_docente(self, servicio, ctx):
        with pytest.raises(SinPermiso):
            servicio.reporte_curso(ctx["ajeno"].id, EMAIL, None)


# ── Por actividad ────────────────────────────────────────────────────────────

class TestPorActividad:
    def test_actividad_de_otro_curso(self, servicio, db_session, ctx):
        otro, _ = _curso(db_session, "Otro", "O-1")
        act_otro, _ = _actividad(db_session, otro, [(None, [100])])
        with pytest.raises(ActividadFueraDelCurso, match="^Actividad no encontrada en este curso$"):
            servicio.reporte_actividad(ctx["curso"].id, act_otro.id, EMAIL, None)

    def test_seccion_de_otro_curso(self, servicio, ctx):
        with pytest.raises(SeccionFueraDelCurso):
            servicio.resumen_xlsx(ctx["curso"].id, ctx["act"].id, EMAIL, ctx["sa"].id)

    def test_resumen_devuelve_libro_y_nombre(self, servicio, ctx):
        contenido, nombre = servicio.resumen_xlsx(ctx["curso"].id, ctx["act"].id, EMAIL, ctx["s1"].id)
        assert contenido[:2] == b"PK" and nombre.endswith(".xlsx")

    def test_detalle_sube_a_drive(self, servicio, ctx, drive):
        contenido, nombre, resultado = servicio.detalle_xlsx(ctx["curso"].id, ctx["act"].id, EMAIL, None)
        assert drive == [nombre]
        assert resultado["estado"] == "simulado"

    @pytest.mark.parametrize("cual", ["actividad", "seccion"])
    def test_detalle_no_llama_a_drive_si_la_verificacion_falla(self, servicio, ctx, drive, cual):
        actividad_id = 99999 if cual == "actividad" else ctx["act"].id
        seccion_id = ctx["sa"].id if cual == "seccion" else None
        with pytest.raises((ActividadFueraDelCurso, SeccionFueraDelCurso)):
            servicio.detalle_xlsx(ctx["curso"].id, actividad_id, EMAIL, seccion_id)
        assert drive == []


# ── Independencia de FastAPI ─────────────────────────────────────────────────

@pytest.mark.parametrize("modulo", ["app/services/reportes.py", "app/services/calculo_reportes.py"])
def test_no_depende_de_fastapi(modulo):
    """El servicio y el cálculo de reportes no importan nada de FastAPI ni de Starlette."""
    arbol = ast.parse((Path(__file__).parent.parent / modulo).read_text(encoding="utf-8"))
    importados = set()
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Import):
            importados.update(alias.name for alias in nodo.names)
        elif isinstance(nodo, ast.ImportFrom) and nodo.module:
            importados.add(nodo.module)
    raices = {nombre.split(".")[0] for nombre in importados}
    assert not raices & {"fastapi", "starlette"}
