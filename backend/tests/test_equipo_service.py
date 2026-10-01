"""
EquipoService (services/equipos.py) y la regla compartida seccion_del_curso
(services/acceso.py) probados sin HTTP: se llama al servicio con una sesión SQLite y se
verifica el error de negocio que lanza, el orden de las validaciones y lo que queda en la BD.
"""
import ast
from pathlib import Path

import pytest

from app.models import EquipoTrabajo, MiembroEquipo
from app.models.actividad import TipoActividad
from app.repositories.seccion import SeccionRepository
from app.schemas.equipo import EquipoCreate
from app.services.acceso import seccion_del_curso
from app.services.equipos import EquipoService
from app.services.errores import (
    ActividadNoEncontrada, ActividadNoGrupal, EquipoNoEncontrado, EstudianteEnDosEquipos,
    EstudianteFueraDeSeccion, EstudianteRepetidoEnEquipo, EstudianteYaEnOtroEquipo, SeccionFueraDelCurso,
    SinPermiso, SolicitudInvalida,
)
from tests.test_catalogo_ra_abet import MOCK_USER, db_session  # noqa: F401 (fixtures)
from tests.test_exportar_estudiantes import _curso, _est
from tests.test_reportes import _actividad, _calificar

EMAIL = MOCK_USER["email"]


@pytest.fixture()
def servicio(db_session):
    return EquipoService(db_session)


@pytest.fixture()
def contexto(db_session):
    """Curso con S1 y S2, una actividad grupal con 2 criterios, Ana y Beto en S1 y Dani en S2."""
    curso, [s1, s2] = _curso(db_session, secciones=("S1", "S2"))
    act, [criterios] = _actividad(db_session, curso, [(None, [40, 60])], tipo=TipoActividad.grupal)
    ana, beto = _est(db_session, s1, "Ana", "1"), _est(db_session, s1, "Beto", "2")
    dani = _est(db_session, s2, "Dani", "3")
    return {"curso": curso, "s1": s1, "s2": s2, "act": act, "criterios": criterios,
            "ana": ana, "beto": beto, "dani": dani}


def _eq(nombre, *estudiantes):
    return EquipoCreate(nombre=nombre, estudiante_ids=[e.id for e in estudiantes])


def _n_equipos(db_session, act):
    db_session.expire_all()
    return db_session.query(EquipoTrabajo).filter_by(actividad_id=act.id).count()


# ── seccion_del_curso (services/acceso.py) ───────────────────────────────────

class TestSeccionDelCurso:
    def test_devuelve_la_seccion(self, db_session, contexto):
        assert seccion_del_curso(SeccionRepository(db_session), contexto["s1"].id, contexto["curso"].id) is contexto["s1"]

    @pytest.mark.parametrize("cual", ["inexistente", "de_otro_curso"])
    def test_fuera_del_curso(self, db_session, contexto, cual):
        otro, [ajena] = _curso(db_session, "Otro", "O-1")
        seccion_id = 99999 if cual == "inexistente" else ajena.id
        with pytest.raises(SeccionFueraDelCurso, match="^Sección no encontrada en este curso$"):
            seccion_del_curso(SeccionRepository(db_session), seccion_id, contexto["curso"].id)


# ── Acceso: actividad, sección y equipo ──────────────────────────────────────

class TestAcceso:
    def test_actividad_inexistente(self, servicio, contexto):
        with pytest.raises(ActividadNoEncontrada):
            servicio.listar(99999, contexto["s1"].id, EMAIL)

    def test_actividad_de_otro_docente(self, servicio, contexto):
        with pytest.raises(SinPermiso, match="^No tiene permiso sobre esta actividad$"):
            servicio.modo_calificacion(contexto["act"].id, contexto["s1"].id, "otro@uao.edu.co")

    def test_editar_equipo_inexistente(self, servicio):
        with pytest.raises(EquipoNoEncontrado):
            servicio.editar(99999, EMAIL, "X", None)

    def test_editar_equipo_de_otro_docente_nombra_al_equipo(self, servicio, contexto):
        [e1] = servicio.crear(contexto["act"].id, contexto["s1"].id, EMAIL, [_eq("E1")])
        with pytest.raises(SinPermiso, match="^No tiene permiso sobre este equipo$"):
            servicio.editar(e1.id, "otro@uao.edu.co", "Mío", None)


# ── Crear ────────────────────────────────────────────────────────────────────

class TestCrear:
    def test_crea_con_sus_miembros(self, servicio, contexto):
        e1, e2 = servicio.crear(
            contexto["act"].id, contexto["s1"].id, EMAIL, [_eq("E1", contexto["ana"]), _eq("E2", contexto["beto"])]
        )
        assert [(e.nombre, [m.id for m in e.miembros]) for e in (e1, e2)] == [
            ("E1", [contexto["ana"].id]), ("E2", [contexto["beto"].id]),
        ]
        assert (e1.calificado, e1.nota_total) == (False, None)

    def test_actividad_individual(self, servicio, db_session, contexto):
        individual, _ = _actividad(db_session, contexto["curso"], [(None, [100])])
        with pytest.raises(ActividadNoGrupal):
            servicio.crear(individual.id, contexto["s1"].id, EMAIL, [_eq("E1", contexto["ana"])])

    def test_estudiante_de_otra_seccion(self, servicio, db_session, contexto):
        with pytest.raises(EstudianteFueraDeSeccion) as exc:
            servicio.crear(contexto["act"].id, contexto["s1"].id, EMAIL,
                           [_eq("E1", contexto["ana"]), _eq("E2", contexto["dani"])])
        assert (exc.value.estudiante_id, exc.value.seccion_id) == (contexto["dani"].id, contexto["s1"].id)
        assert _n_equipos(db_session, contexto["act"]) == 0

    def test_repetido_en_el_mismo_equipo(self, servicio, db_session, contexto):
        with pytest.raises(EstudianteRepetidoEnEquipo) as exc:
            servicio.crear(contexto["act"].id, contexto["s1"].id, EMAIL, [_eq("E1", contexto["ana"], contexto["ana"])])
        assert (exc.value.estudiante, exc.value.equipo) == ("Ana", "E1")
        assert _n_equipos(db_session, contexto["act"]) == 0

    def test_en_dos_equipos_del_envio(self, servicio, contexto):
        with pytest.raises(EstudianteEnDosEquipos) as exc:
            servicio.crear(contexto["act"].id, contexto["s1"].id, EMAIL,
                           [_eq("E1", contexto["ana"]), _eq("E2", contexto["ana"])])
        assert exc.value.equipos == ("E1", "E2")

    def test_ya_en_otro_equipo_de_la_actividad(self, servicio, db_session, contexto):
        servicio.crear(contexto["act"].id, contexto["s1"].id, EMAIL, [_eq("E1", contexto["ana"])])
        with pytest.raises(EstudianteYaEnOtroEquipo) as exc:
            servicio.crear(contexto["act"].id, contexto["s1"].id, EMAIL, [_eq("E2", contexto["beto"], contexto["ana"])])
        assert (exc.value.estudiante, exc.value.equipo) == ("Ana", "E1")
        assert _n_equipos(db_session, contexto["act"]) == 1

    def test_la_seccion_se_revisa_antes_que_el_repetido(self, servicio, contexto):
        with pytest.raises(EstudianteFueraDeSeccion):
            servicio.crear(contexto["act"].id, contexto["s1"].id, EMAIL, [_eq("E1", contexto["dani"], contexto["dani"])])


# ── Editar ───────────────────────────────────────────────────────────────────

class TestEditar:
    @pytest.fixture()
    def e1(self, servicio, contexto):
        [equipo] = servicio.crear(contexto["act"].id, contexto["s1"].id, EMAIL, [_eq("E1", contexto["ana"])])
        return equipo

    def _miembros(self, db_session, equipo_id):
        filas = db_session.query(MiembroEquipo.estudiante_id).filter_by(equipo_id=equipo_id).all()
        return sorted(eid for (eid,) in filas)

    def test_reemplaza_miembros_y_conserva_al_propio(self, servicio, contexto, e1):
        editado = servicio.editar(e1.id, EMAIL, None, [contexto["ana"].id, contexto["beto"].id])
        assert sorted(m.id for m in editado.miembros) == sorted([contexto["ana"].id, contexto["beto"].id])

    def test_repetido_usa_el_nombre_nuevo_y_no_toca_miembros(self, servicio, db_session, contexto, e1):
        with pytest.raises(EstudianteRepetidoEnEquipo) as exc:
            servicio.editar(e1.id, EMAIL, "Nuevo", [contexto["beto"].id, contexto["beto"].id])
        assert exc.value.equipo == "Nuevo"
        assert self._miembros(db_session, e1.id) == [contexto["ana"].id]

    def test_estudiante_de_otra_seccion(self, servicio, contexto, e1):
        with pytest.raises(EstudianteFueraDeSeccion, match="no pertenece a la sección del equipo$") as exc:
            servicio.editar(e1.id, EMAIL, None, [contexto["dani"].id])
        assert exc.value.seccion_id is None


# ── Modo de calificación y estado ────────────────────────────────────────────

class TestModoCalificacion:
    def test_grupal_cuenta_los_equipos_calificados(self, servicio, db_session, contexto):
        e1, _ = servicio.crear(
            contexto["act"].id, contexto["s1"].id, EMAIL, [_eq("E1", contexto["ana"]), _eq("E2", contexto["beto"])]
        )
        equipo = db_session.get(EquipoTrabajo, e1.id)
        _calificar(db_session, contexto["criterios"], [1, 1], equipo=equipo)
        modo = servicio.modo_calificacion(contexto["act"].id, contexto["s1"].id, EMAIL)
        assert (modo.tipo, modo.total, modo.calificados) == ("grupal", 2, 1)
        assert [(i.nombre, i.calificado) for i in modo.items] == [("E1", True), ("E2", False)]

    def test_individual_lista_estudiantes_de_la_seccion(self, servicio, db_session, contexto):
        individual, _ = _actividad(db_session, contexto["curso"], [(None, [100])])
        modo = servicio.modo_calificacion(individual.id, contexto["s1"].id, EMAIL)
        assert (modo.tipo, [i.nombre for i in modo.items], modo.calificados) == ("individual", ["Ana", "Beto"], 0)


def test_categorias():
    for clase in (ActividadNoGrupal, EstudianteFueraDeSeccion, EstudianteRepetidoEnEquipo,
                  EstudianteEnDosEquipos, EstudianteYaEnOtroEquipo):
        assert issubclass(clase, SolicitudInvalida)


# ── Independencia de FastAPI ─────────────────────────────────────────────────

def test_no_depende_de_fastapi():
    """El servicio no importa nada de FastAPI ni de Starlette."""
    arbol = ast.parse((Path(__file__).parent.parent / "app/services/equipos.py").read_text(encoding="utf-8"))
    importados = set()
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Import):
            importados.update(alias.name for alias in nodo.names)
        elif isinstance(nodo, ast.ImportFrom) and nodo.module:
            importados.add(nodo.module)
    raices = {nombre.split(".")[0] for nombre in importados}
    assert not raices & {"fastapi", "starlette"}
