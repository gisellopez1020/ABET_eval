"""
RetroalimentacionService (services/retroalimentacion.py) sin HTTP, con SQLite y la
llamada a Gemini simulada: la capa estructurada, cuándo se redacta con IA, el fallback
(sin key, falla, timeout), el reuso de la guardada y su invalidación por huella, y que
a la API no viajen nombres de estudiantes ni del equipo.
"""
import functools

import httpx
import pytest

from app.config import settings
from app.models import Calificacion, Criterio, EquipoTrabajo, Retroalimentacion
from app.models.actividad import TipoActividad
from app.services import gemini
from app.services.errores import EquipoFueraDeActividad, EstudianteFueraDelCurso, SinPermiso
from app.services.retroalimentacion import RetroalimentacionService
from tests.test_catalogo_ra_abet import MOCK_USER, db_session  # noqa: F401 (fixtures)
from tests.test_exportar_estudiantes import _curso, _est
from tests.test_reportes import _actividad, _calificar

EMAIL = MOCK_USER["email"]


@pytest.fixture()
def servicio(db_session):
    return RetroalimentacionService(db_session)


@pytest.fixture()
def ctx(db_session):
    curso, [s1] = _curso(db_session)
    ajeno, [sa] = _curso(db_session, "Ajena", "A-1", email="otro@uao.edu.co")
    return {"curso": curso, "s1": s1, "ajeno": ajeno,
            "ana": _est(db_session, s1, "Anastasia Quiñones", "1"),
            "zoe": _est(db_session, sa, "Zoe", "9")}


@pytest.fixture()
def ia(monkeypatch):
    """Gemini configurado y simulado: registra cada llamada y responde `ia.texto`."""
    monkeypatch.setattr(settings, "gemini_api_key", "key-de-prueba")

    class Simulada:
        texto = "Lograron lo principal y pueden reforzar lo demás."
        llamadas = []

        def __call__(self, instrucciones, mensaje, transport=None):
            self.llamadas.append((instrucciones, mensaje))
            return self.texto

    simulada = Simulada()
    simulada.llamadas = []
    monkeypatch.setattr(gemini, "redactar", simulada)
    return simulada


def _equipo(db_session, actividad, seccion, nombre="Los Halcones Rojos"):
    equipo = EquipoTrabajo(nombre=nombre, actividad_id=actividad.id, seccion_id=seccion.id)
    db_session.add(equipo)
    db_session.commit()
    return equipo


def _textos(db_session, criterios, textos):
    for c, t in zip(criterios, textos):
        c.texto = t
    db_session.commit()


# ── Capa estructurada ────────────────────────────────────────────────────────

class TestEstructurada:
    def test_cumplidos_y_por_reforzar_por_aspecto(self, servicio, db_session, ctx):
        act, [a0, a1] = _actividad(db_session, ctx["curso"], [(None, [30, 30]), (None, [40])])
        _textos(db_session, a0 + a1, ["Diagrama coherente", "Justifica tecnologías", "Pruebas unitarias"])
        _calificar(db_session, a0 + a1, [1, 0, 1], estudiante=ctx["ana"])

        out = servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL)

        assert out.completa is True
        assert out.fuente == "estructurada" and out.texto is None and out.generada_en is None
        assert [(a.nombre, a.cumplidos, a.por_reforzar) for a in out.aspectos] == [
            ("A0", ["Diagrama coherente"], ["Justifica tecnologías"]),
            ("A1", ["Pruebas unitarias"], []),
        ]

    def test_sin_key_no_llama_a_la_ia_ni_guarda(self, servicio, db_session, ctx, monkeypatch):
        monkeypatch.setattr(settings, "gemini_api_key", "PLACEHOLDER")
        monkeypatch.setattr(gemini.httpx, "Client", None)  # cualquier intento de red fallaría
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [50, 50])])
        _calificar(db_session, crits, [1, 1], estudiante=ctx["ana"])

        out = servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL)

        assert out.fuente == "estructurada" and out.completa is True
        assert db_session.query(Retroalimentacion).count() == 0

    def test_incompleta_no_llama_a_la_ia(self, servicio, db_session, ctx, ia):
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [50, 50])])
        _calificar(db_session, crits[:1], [1], estudiante=ctx["ana"])

        out = servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL)

        assert out.completa is False and out.fuente == "estructurada"
        assert out.aspectos[0].cumplidos == ["C0"] and out.aspectos[0].por_reforzar == []
        assert ia.llamadas == []

    def test_sin_criterios_no_esta_completa(self, servicio, db_session, ctx, ia):
        act, _ = _actividad(db_session, ctx["curso"], [])
        out = servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL)
        assert out.completa is False and out.aspectos == [] and ia.llamadas == []


# ── Redacción con IA y reuso ─────────────────────────────────────────────────

class TestConIA:
    def test_redacta_y_guarda(self, servicio, db_session, ctx, ia):
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [50, 50])])
        _calificar(db_session, crits, [1, 0], estudiante=ctx["ana"])

        out = servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL)

        assert out.fuente == "ia" and out.texto == ia.texto and out.generada_en is not None
        # La capa estructurada viaja igual
        assert out.aspectos[0].cumplidos == ["C0"] and out.aspectos[0].por_reforzar == ["C1"]
        guardada = db_session.query(Retroalimentacion).one()
        assert (guardada.estudiante_id, guardada.equipo_id, guardada.texto) == (ctx["ana"].id, None, ia.texto)
        assert guardada.modelo == settings.gemini_model

    def test_reusa_la_guardada_sin_volver_a_llamar(self, servicio, db_session, ctx, ia):
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [50, 50])])
        _calificar(db_session, crits, [1, 0], estudiante=ctx["ana"])

        primera = servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL)
        ia.texto = "otro texto que no debe aparecer"
        segunda = servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL)

        assert len(ia.llamadas) == 1
        assert segunda.texto == primera.texto and segunda.fuente == "ia"

    def test_cambiar_una_calificacion_la_regenera(self, servicio, db_session, ctx, ia):
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [50, 50])])
        _calificar(db_session, crits, [1, 0], estudiante=ctx["ana"])
        servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL)

        db_session.query(Calificacion).filter_by(criterio_id=crits[1].id).one().valor = 1
        db_session.commit()
        ia.texto = "Lograron todo."
        out = servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL)

        assert len(ia.llamadas) == 2 and out.texto == "Lograron todo."
        assert 'No cumplido' not in ia.llamadas[1][1]
        assert db_session.query(Retroalimentacion).one().texto == "Lograron todo."

    def test_cambiar_el_texto_de_un_criterio_la_regenera(self, servicio, db_session, ctx, ia):
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [100])])
        _calificar(db_session, crits, [1], estudiante=ctx["ana"])
        servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL)

        _textos(db_session, crits, ["Texto corregido"])
        servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL)

        assert len(ia.llamadas) == 2 and '"Texto corregido"' in ia.llamadas[1][1]

    def test_cambiar_el_modelo_la_regenera(self, servicio, db_session, ctx, ia, monkeypatch):
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [100])])
        _calificar(db_session, crits, [1], estudiante=ctx["ana"])
        servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL)

        monkeypatch.setattr(settings, "gemini_model", "otro-modelo")
        servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL)

        assert len(ia.llamadas) == 2
        assert db_session.query(Retroalimentacion).one().modelo == "otro-modelo"

    def test_equipo(self, servicio, db_session, ctx, ia):
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [50, 50])], tipo=TipoActividad.grupal)
        equipo = _equipo(db_session, act, ctx["s1"])
        _calificar(db_session, crits, [1, 0], equipo=equipo)

        out = servicio.de_equipo(act.id, equipo.id, EMAIL)

        assert out.fuente == "ia"
        assert ia.llamadas[0][1].startswith("Tipo: equipo")
        guardada = db_session.query(Retroalimentacion).one()
        assert (guardada.equipo_id, guardada.estudiante_id) == (equipo.id, None)

    def test_estudiante_y_equipo_no_comparten_la_guardada(self, servicio, db_session, ctx, ia):
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [100])], tipo=TipoActividad.grupal)
        equipo = _equipo(db_session, act, ctx["s1"])
        beto = _est(db_session, ctx["s1"], "Beto", "2")
        for quien in ({"equipo": equipo}, {"estudiante": ctx["ana"]}, {"estudiante": beto}):
            _calificar(db_session, crits, [1], **quien)

        servicio.de_equipo(act.id, equipo.id, EMAIL)
        servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL)
        servicio.de_estudiante(act.id, beto.id, EMAIL)

        # Los únicos planos admiten varias filas con equipo_id NULL (y con estudiante_id NULL)
        assert db_session.query(Retroalimentacion).count() == 3

    def test_no_envia_nombres_de_estudiantes_ni_del_equipo(self, servicio, db_session, ctx, ia):
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [50, 50])], tipo=TipoActividad.grupal)
        equipo = _equipo(db_session, act, ctx["s1"])
        _calificar(db_session, crits, [1, 0], equipo=equipo)
        _calificar(db_session, crits, [1, 0], estudiante=ctx["ana"])

        servicio.de_equipo(act.id, equipo.id, EMAIL)
        servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL)

        enviado = "\n".join(i + m for i, m in ia.llamadas)
        for dato in ("Anastasia", "Quiñones", "Halcones", ctx["ana"].codigo_estudiante + "\n"):
            assert dato not in enviado
        assert '- Cumplido: "C0"' in enviado and '- No cumplido: "C1"' in enviado


# ── Fallback cuando la IA falla ──────────────────────────────────────────────

class TestFallback:
    def test_si_la_ia_falla_devuelve_la_estructurada_sin_guardar(self, servicio, db_session, ctx, ia):
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [50, 50])])
        _calificar(db_session, crits, [1, 0], estudiante=ctx["ana"])
        ia.texto = None

        out = servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL)

        assert out.fuente == "estructurada" and out.completa is True and out.texto is None
        assert db_session.query(Retroalimentacion).count() == 0

        # La siguiente apertura lo vuelve a intentar
        ia.texto = "Ahora sí."
        assert servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL).texto == "Ahora sí."
        assert len(ia.llamadas) == 2

    @pytest.mark.parametrize("respuesta", [
        lambda r: (_ for _ in ()).throw(httpx.ReadTimeout("lento")),
        lambda r: httpx.Response(503, json={"error": {"message": "high demand"}}),
    ], ids=["timeout", "503"])
    def test_timeout_o_error_real_del_cliente(self, servicio, db_session, ctx, monkeypatch, respuesta):
        """De punta a punta con el cliente real (httpx.MockTransport, sin red)."""
        monkeypatch.setattr(settings, "gemini_api_key", "key-de-prueba")
        monkeypatch.setattr(
            gemini, "redactar",
            functools.partial(gemini.redactar, transport=httpx.MockTransport(respuesta)),
        )
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [50, 50])])
        _calificar(db_session, crits, [1, 0], estudiante=ctx["ana"])

        out = servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL)

        assert out.fuente == "estructurada" and out.aspectos[0].por_reforzar == ["C1"]
        assert db_session.query(Retroalimentacion).count() == 0

    def test_una_guardada_vieja_no_se_muestra_si_la_ia_falla(self, servicio, db_session, ctx, ia):
        """Si los datos cambiaron, el texto guardado ya no los describe: mejor la estructurada."""
        act, [crits] = _actividad(db_session, ctx["curso"], [(None, [50, 50])])
        _calificar(db_session, crits, [1, 0], estudiante=ctx["ana"])
        servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL)

        db_session.query(Calificacion).filter_by(criterio_id=crits[1].id).one().valor = 1
        db_session.commit()
        ia.texto = None
        out = servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL)

        assert out.fuente == "estructurada"
        assert out.aspectos[0].cumplidos == ["C0", "C1"]


# ── Permisos (los mismos que leer las calificaciones) ────────────────────────

class TestPermisos:
    def test_equipo_de_otra_actividad(self, servicio, db_session, ctx, ia):
        act, _ = _actividad(db_session, ctx["curso"], [(None, [100])], tipo=TipoActividad.grupal)
        otra, _ = _actividad(db_session, ctx["curso"], [(None, [100])], tipo=TipoActividad.grupal)
        equipo = _equipo(db_session, otra, ctx["s1"])
        with pytest.raises(EquipoFueraDeActividad):
            servicio.de_equipo(act.id, equipo.id, EMAIL)

    def test_estudiante_de_otro_curso(self, servicio, db_session, ctx, ia):
        act, _ = _actividad(db_session, ctx["curso"], [(None, [100])])
        with pytest.raises(EstudianteFueraDelCurso):
            servicio.de_estudiante(act.id, ctx["zoe"].id, EMAIL)

    def test_actividad_de_otro_docente(self, servicio, db_session, ctx, ia):
        act, _ = _actividad(db_session, ctx["ajeno"], [(None, [100])])
        with pytest.raises(SinPermiso):
            servicio.de_estudiante(act.id, ctx["zoe"].id, EMAIL)
        assert ia.llamadas == []


def test_borrar_el_estudiante_borra_su_retroalimentacion(servicio, db_session, ctx, ia):
    act, [crits] = _actividad(db_session, ctx["curso"], [(None, [100])])
    _calificar(db_session, crits, [1], estudiante=ctx["ana"])
    servicio.de_estudiante(act.id, ctx["ana"].id, EMAIL)

    db_session.delete(ctx["ana"])
    db_session.commit()

    assert db_session.query(Retroalimentacion).count() == 0
