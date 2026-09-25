"""
Reporte ABET en dos niveles (Criterio y Resultado de Aprendizaje): normalización
por aspecto, promedio simple entre actividades, conteo por integrante en
actividades grupales, ponderación renormalizada del RA y rangos del curso.

Reutiliza las fixtures de SQLite en memoria (esquema completo, FK activadas).
"""
import pytest

from app.models import (
    Actividad, Aspecto, Calificacion, Criterio, Curso, EquipoTrabajo,
    Estudiante, MiembroEquipo, Seccion,
)
from app.models.actividad import TipoActividad
from app.utils.calculo import calcular_nota_parcial
from tests.test_catalogo_ra_abet import MOCK_USER, _ra, client, db_session  # noqa: F401 (fixtures)
from tests.test_catalogo_jerarquia import _crit

DEFAULT = {"0.0-2.9": 0, "3.0-3.9": 0, "4.0-5.0": 0}


@pytest.fixture()
def curso(client, db_session):
    """Curso con dos secciones y catálogo 2.1 (2.1.1/2.1.2/2.1.3 a 0.4/0.3/0.3) y 4.1 (4.1.1)."""
    c = Curso(nombre="Redes", codigo="R-1", periodo="2026-2", docente_email=MOCK_USER["email"], ra_abet=[])
    db_session.add(c)
    db_session.flush()
    db_session.add_all([Seccion(nombre="S1", curso_id=c.id), Seccion(nombre="S2", curso_id=c.id)])
    db_session.commit()

    client.post("/catalogo/ra-abet", json=_ra("2.1"))
    client.post("/catalogo/ra-abet", json=_crit("2.1.1", "2.1", 0.4))
    client.post("/catalogo/ra-abet", json=_crit("2.1.2", "2.1", 0.3))
    client.post("/catalogo/ra-abet", json=_crit("2.1.3", "2.1", 0.3))
    client.post("/catalogo/ra-abet", json=_ra("4.1"))
    client.post("/catalogo/ra-abet", json=_crit("4.1.1", "4.1", 1))
    return c


def _seccion(db_session, curso, nombre="S1"):
    return db_session.query(Seccion).filter_by(curso_id=curso.id, nombre=nombre).one()


def _estudiante(db_session, curso, nombre, seccion="S1"):
    est = Estudiante(nombre_completo=nombre, codigo_estudiante=nombre, seccion_id=_seccion(db_session, curso, seccion).id)
    db_session.add(est)
    db_session.commit()
    return est


def _actividad(db_session, curso, aspectos, tipo=TipoActividad.individual):
    """aspectos: [(codigo_abet | None, [pesos de sus criterios])]. Devuelve (actividad, [[criterios]])."""
    act = Actividad(nombre="Act", tipo=tipo, peso_nota_final=20, curso_id=curso.id)
    db_session.add(act)
    db_session.flush()
    criterios = []
    for i, (codigo, pesos) in enumerate(aspectos):
        asp = Aspecto(nombre=f"A{i}", actividad_id=act.id, orden=i, codigo_abet=codigo)
        db_session.add(asp)
        db_session.flush()
        crits = [Criterio(texto=f"C{j}", peso_porcentaje=p, aspecto_id=asp.id, orden=j) for j, p in enumerate(pesos)]
        db_session.add_all(crits)
        db_session.flush()
        criterios.append(crits)
    db_session.commit()
    return act, criterios


def _calificar(db_session, criterios, valores, estudiante=None, equipo=None):
    for crit, valor in zip(criterios, valores):
        db_session.add(Calificacion(
            criterio_id=crit.id, valor=valor,
            estudiante_id=estudiante.id if estudiante else None,
            equipo_id=equipo.id if equipo else None,
            nota_calculada=calcular_nota_parcial(valor, crit.peso_porcentaje),
        ))
    db_session.commit()


def _reporte(client, curso, **params):
    resp = client.get(f"/reportes/abet/{curso.id}", params=params)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _por_codigo(items):
    return {i["codigo"]: i for i in items}


class TestNivelCriterio:
    def test_solo_aparecen_codigos_vinculados(self, client, db_session, curso):
        _actividad(db_session, curso, [("2.1.1", [50]), (None, [50])])
        rep = _reporte(client, curso)
        assert [c["codigo"] for c in rep["criterios"]] == ["2.1.1"]
        assert [r["codigo"] for r in rep["resultados"]] == ["2.1"]

    def test_aspecto_se_normaliza_a_su_propia_escala(self, client, db_session, curso):
        # El aspecto vinculado pesa 20 % de la actividad; calificado completo debe dar 5.0, no 1.0
        _, crits = _actividad(db_session, curso, [("2.1.1", [10, 10]), (None, [80])])
        ana = _estudiante(db_session, curso, "ANA")
        _calificar(db_session, crits[0] + crits[1], [1, 1, 0], estudiante=ana)
        c = _por_codigo(_reporte(client, curso)["criterios"])["2.1.1"]
        assert c["rangos"] == {**DEFAULT, "4.0-5.0": 1}
        assert c["total"] == 1

    def test_normalizacion_con_pesos_desiguales(self, client, db_session, curso):
        # 5 * (1*15 + 0*5) / 20 = 3.75 -> rango 3.0-3.9
        _, crits = _actividad(db_session, curso, [("2.1.1", [15, 5]), (None, [80])])
        ana = _estudiante(db_session, curso, "ANA")
        _calificar(db_session, crits[0] + crits[1], [1, 0, 1], estudiante=ana)
        c = _por_codigo(_reporte(client, curso)["criterios"])["2.1.1"]
        assert c["rangos"] == {**DEFAULT, "3.0-3.9": 1}

    def test_promedio_simple_entre_actividades(self, client, db_session, curso):
        # Act 1: 2.1.1 pesa 90 % y sale 5.0; Act 2: pesa 10 % y sale 0.0.
        # Promedio simple = 2.5 (con pesos crudos habría dado 4.5).
        _, c1 = _actividad(db_session, curso, [("2.1.1", [90]), (None, [10])])
        _, c2 = _actividad(db_session, curso, [("2.1.1", [10]), (None, [90])])
        ana = _estudiante(db_session, curso, "ANA")
        _calificar(db_session, c1[0] + c1[1], [1, 1], estudiante=ana)
        _calificar(db_session, c2[0] + c2[1], [0, 1], estudiante=ana)
        c = _por_codigo(_reporte(client, curso)["criterios"])["2.1.1"]
        assert c["rangos"] == {**DEFAULT, "0.0-2.9": 1}
        assert c["total"] == 1

    def test_aspectos_de_una_actividad_forman_un_bloque(self, client, db_session, curso):
        # Dos aspectos 2.1.1 en la misma actividad: 5 * (1*30 + 0*10) / 40 = 3.75
        _, crits = _actividad(db_session, curso, [("2.1.1", [30]), ("2.1.1", [10]), (None, [60])])
        ana = _estudiante(db_session, curso, "ANA")
        _calificar(db_session, crits[0] + crits[1] + crits[2], [1, 0, 1], estudiante=ana)
        c = _por_codigo(_reporte(client, curso)["criterios"])["2.1.1"]
        assert c["rangos"] == {**DEFAULT, "3.0-3.9": 1}

    def test_aspecto_incompleto_no_cuenta(self, client, db_session, curso):
        _, crits = _actividad(db_session, curso, [("2.1.1", [50, 50])])
        ana = _estudiante(db_session, curso, "ANA")
        _calificar(db_session, crits[0][:1], [1], estudiante=ana)
        c = _por_codigo(_reporte(client, curso)["criterios"])["2.1.1"]
        assert c["total"] == 0

    def test_vinculado_sin_calificaciones_aparece_en_cero(self, client, db_session, curso):
        _actividad(db_session, curso, [("4.1.1", [100])])
        _estudiante(db_session, curso, "ANA")
        rep = _reporte(client, curso)
        assert _por_codigo(rep["criterios"])["4.1.1"]["total"] == 0
        assert _por_codigo(rep["resultados"])["4.1"]["total"] == 0


class TestGrupal:
    def test_cuenta_cada_integrante(self, client, db_session, curso):
        act, crits = _actividad(db_session, curso, [("2.1.1", [100])], tipo=TipoActividad.grupal)
        miembros = [_estudiante(db_session, curso, n) for n in ("ANA", "BEA", "CAR")]
        _estudiante(db_session, curso, "SIN EQUIPO")
        equipo = EquipoTrabajo(nombre="E1", actividad_id=act.id, seccion_id=_seccion(db_session, curso).id)
        db_session.add(equipo)
        db_session.flush()
        db_session.add_all([MiembroEquipo(equipo_id=equipo.id, estudiante_id=m.id) for m in miembros])
        db_session.commit()
        _calificar(db_session, crits[0], [1], equipo=equipo)

        rep = _reporte(client, curso)
        assert _por_codigo(rep["criterios"])["2.1.1"]["rangos"] == {**DEFAULT, "4.0-5.0": 3}
        assert _por_codigo(rep["resultados"])["2.1"]["rangos"] == {**DEFAULT, "4.0-5.0": 3}

    def test_combina_grupal_e_individual(self, client, db_session, curso):
        grupal, cg = _actividad(db_session, curso, [("2.1.1", [100])], tipo=TipoActividad.grupal)
        _, ci = _actividad(db_session, curso, [("2.1.1", [100])])
        ana = _estudiante(db_session, curso, "ANA")
        equipo = EquipoTrabajo(nombre="E1", actividad_id=grupal.id, seccion_id=ana.seccion_id)
        db_session.add(equipo)
        db_session.flush()
        db_session.add(MiembroEquipo(equipo_id=equipo.id, estudiante_id=ana.id))
        db_session.commit()
        _calificar(db_session, cg[0], [1], equipo=equipo)   # 5.0
        _calificar(db_session, ci[0], [0], estudiante=ana)  # 0.0 -> promedio 2.5
        c = _por_codigo(_reporte(client, curso)["criterios"])["2.1.1"]
        assert c["rangos"] == {**DEFAULT, "0.0-2.9": 1}


class TestNivelRA:
    def test_pondera_y_renormaliza_sin_el_criterio_no_vinculado(self, client, db_session, curso):
        # 2.1.1 = 5.0 (peso 0.4), 2.1.2 = 0.0 (peso 0.3), 2.1.3 sin vincular.
        # (0.4*5 + 0.3*0) / 0.7 = 2.857 -> 0.0-2.9. Si 2.1.3 contara como 0 daría 2.0; igual rango,
        # así que se verifica además con 2.1.2 = 2.5: (2 + 0.75) / 0.7 = 3.93 -> 3.0-3.9 (con 0 sería 2.75).
        _, crits = _actividad(db_session, curso, [("2.1.1", [50]), ("2.1.2", [25, 25])])
        ana = _estudiante(db_session, curso, "ANA")
        _calificar(db_session, crits[0] + crits[1], [1, 1, 0], estudiante=ana)
        ra = _por_codigo(_reporte(client, curso)["resultados"])["2.1"]
        assert ra["rangos"] == {**DEFAULT, "3.0-3.9": 1}
        assert ra["criterios_con_evidencia"] == ["2.1.1", "2.1.2"]
        assert ra["criterios_sin_evidencia"] == ["2.1.3"]

    def test_ra_sin_evidencia_no_aparece(self, client, db_session, curso):
        _actividad(db_session, curso, [("2.1.1", [100])])
        assert [r["codigo"] for r in _reporte(client, curso)["resultados"]] == ["2.1"]

    def test_descripciones_del_catalogo(self, client, db_session, curso):
        _actividad(db_session, curso, [("2.1.1", [100])])
        rep = _reporte(client, curso)
        assert rep["criterios"][0]["descripcion"] == "Criterio 2.1.1"
        assert rep["criterios"][0]["codigo_padre"] == "2.1"
        assert rep["criterios"][0]["peso"] == 0.4
        assert rep["resultados"][0]["descripcion"] == "Descripción 2.1"


class TestRangos:
    def test_usa_los_rangos_del_curso(self, client, db_session, curso):
        curso.rangos_calificacion = [
            {"etiqueta": "Insuficiente", "minimo": 0, "maximo": 1.9},
            {"etiqueta": "Básico", "minimo": 2, "maximo": 2.9},
            {"etiqueta": "Competente", "minimo": 3, "maximo": 3.9},
            {"etiqueta": "Destacado", "minimo": 4, "maximo": 5},
        ]
        db_session.commit()
        _, crits = _actividad(db_session, curso, [("2.1.1", [50, 50])])
        for nombre, valores in (("ANA", [1, 1]), ("BEA", [1, 0]), ("CAR", [0, 0])):
            _calificar(db_session, crits[0], valores, estudiante=_estudiante(db_session, curso, nombre))
        rep = _reporte(client, curso)
        assert [r["etiqueta"] for r in rep["rangos"]] == ["Insuficiente", "Básico", "Competente", "Destacado"]
        assert rep["criterios"][0]["rangos"] == {"Insuficiente": 1, "Básico": 1, "Competente": 0, "Destacado": 1}

    def test_redondea_a_un_decimal(self, client, db_session, curso):
        # 5 * 59 / 100 = 2.95 -> 3.0 (no cae en el hueco entre 2.9 y 3.0)
        _, crits = _actividad(db_session, curso, [("2.1.1", [59, 41])])
        _calificar(db_session, crits[0], [1, 0], estudiante=_estudiante(db_session, curso, "ANA"))
        c = _reporte(client, curso)["criterios"][0]
        assert c["rangos"] == {**DEFAULT, "3.0-3.9": 1}
        assert c["sin_clasificar"] == 0

    def test_nota_en_hueco_es_sin_clasificar(self, client, db_session, curso):
        curso.rangos_calificacion = [
            {"etiqueta": "Bajo", "minimo": 0, "maximo": 2},
            {"etiqueta": "Alto", "minimo": 3, "maximo": 5},
        ]
        db_session.commit()
        _, crits = _actividad(db_session, curso, [("2.1.1", [50, 50])])
        _calificar(db_session, crits[0], [1, 0], estudiante=_estudiante(db_session, curso, "ANA"))  # 2.5
        c = _reporte(client, curso)["criterios"][0]
        assert c["rangos"] == {"Bajo": 0, "Alto": 0}
        assert c["sin_clasificar"] == 1
        assert c["total"] == 1


class TestFiltrosYPermisos:
    def test_filtro_por_seccion(self, client, db_session, curso):
        _, crits = _actividad(db_session, curso, [("2.1.1", [100])])
        _calificar(db_session, crits[0], [1], estudiante=_estudiante(db_session, curso, "ANA", "S1"))
        _calificar(db_session, crits[0], [0], estudiante=_estudiante(db_session, curso, "BEA", "S2"))
        s2 = _seccion(db_session, curso, "S2")
        c = _reporte(client, curso, seccion_id=s2.id)["criterios"][0]
        assert c["rangos"] == {**DEFAULT, "0.0-2.9": 1}

    def test_curso_inexistente(self, client):
        assert client.get("/reportes/abet/999").status_code == 404

    def test_curso_de_otro_docente(self, client, db_session):
        otro = Curso(nombre="X", codigo="X", periodo="2026-2", docente_email="otro@uao.edu.co", ra_abet=[])
        db_session.add(otro)
        db_session.commit()
        assert client.get(f"/reportes/abet/{otro.id}").status_code == 403
