"""
SeccionService (services/secciones.py) probado sin HTTP: se llama al servicio con una
sesión SQLite y se verifica que lanza el error de negocio correcto, no un código de estado.
"""
import ast
from pathlib import Path

import pytest

from app.models import Seccion
from app.services.errores import (
    Conflicto, CursoNoEncontrado, NoEncontrado, SeccionConEstudiantes, SeccionNoEncontrada, SinPermiso,
)
from app.services.secciones import SeccionService
from tests.test_calificaciones_lectura import _curso_ajeno
from tests.test_catalogo_ra_abet import MOCK_USER, db_session  # noqa: F401 (fixtures)
from tests.test_secciones import _con_estudiantes, _seccion, curso  # noqa: F401 (fixtures)

EMAIL = MOCK_USER["email"]


@pytest.fixture()
def servicio(db_session):
    return SeccionService(db_session)


class TestListar:
    def test_solo_activas(self, servicio, curso):
        assert sorted(s.nombre for s in servicio.listar(curso.id, EMAIL)) == ["S1", "S2"]

    def test_curso_inexistente(self, servicio):
        with pytest.raises(CursoNoEncontrado, match="^Curso no encontrado$"):
            servicio.listar(99999, EMAIL)

    def test_curso_de_otro_docente(self, servicio, db_session):
        ajeno = _curso_ajeno(db_session)
        with pytest.raises(SinPermiso, match="^No tiene permiso sobre este curso$"):
            servicio.listar(ajeno.id, EMAIL)


class TestCrear:
    def test_crea_y_persiste(self, servicio, db_session, curso):
        seccion = servicio.crear(curso.id, EMAIL, "S4")
        assert seccion.id is not None
        assert (seccion.nombre, seccion.curso_id, seccion.activo) == ("S4", curso.id, True)
        db_session.rollback()  # lo creado ya está confirmado: el servicio hizo commit
        assert db_session.get(Seccion, seccion.id) is not None

    def test_curso_de_otro_docente_no_crea_nada(self, servicio, db_session):
        ajeno = _curso_ajeno(db_session)
        with pytest.raises(SinPermiso):
            servicio.crear(ajeno.id, EMAIL, "S4")
        assert db_session.query(Seccion).filter_by(curso_id=ajeno.id).count() == 1


class TestRenombrar:
    def test_renombra(self, servicio, db_session, curso):
        s1 = _seccion(db_session, curso)
        assert servicio.renombrar(s1.id, EMAIL, "Grupo A").nombre == "Grupo A"

    def test_seccion_inexistente(self, servicio):
        with pytest.raises(SeccionNoEncontrada, match="^Sección no encontrada$"):
            servicio.renombrar(99999, EMAIL, "X")

    def test_seccion_de_otro_docente(self, servicio, db_session):
        ajena = _seccion(db_session, _curso_ajeno(db_session))
        with pytest.raises(SinPermiso):
            servicio.renombrar(ajena.id, EMAIL, "Mía")


class TestEliminar:
    def test_sin_estudiantes(self, servicio, db_session, curso):
        s2 = _seccion(db_session, curso, "S2")
        servicio.eliminar(s2.id, EMAIL)
        assert db_session.get(Seccion, s2.id) is None

    def test_con_estudiantes_lanza_conflicto_y_no_borra(self, servicio, db_session, curso):
        s1 = _seccion(db_session, curso)
        _con_estudiantes(db_session, s1, 3)
        with pytest.raises(SeccionConEstudiantes) as exc:
            servicio.eliminar(s1.id, EMAIL)
        assert (exc.value.nombre, exc.value.cantidad) == ("S1", 3)
        assert db_session.get(Seccion, s1.id) is not None

    def test_seccion_inexistente(self, servicio):
        with pytest.raises(SeccionNoEncontrada):
            servicio.eliminar(99999, EMAIL)

    def test_seccion_de_otro_docente(self, servicio, db_session):
        ajena = _seccion(db_session, _curso_ajeno(db_session))
        with pytest.raises(SinPermiso):
            servicio.eliminar(ajena.id, EMAIL)
        assert db_session.get(Seccion, ajena.id) is not None


def test_cada_error_pertenece_a_su_categoria():
    """La capa HTTP traduce por categoría: cada error concreto debe heredar de la suya."""
    assert issubclass(CursoNoEncontrado, NoEncontrado)
    assert issubclass(SeccionNoEncontrada, NoEncontrado)
    assert issubclass(SeccionConEstudiantes, Conflicto)


@pytest.mark.parametrize("modulo", ["app/services/secciones.py", "app/services/errores.py"])
def test_no_depende_de_fastapi(modulo):
    """El servicio y sus errores no importan nada de FastAPI ni de Starlette."""
    arbol = ast.parse((Path(__file__).parent.parent / modulo).read_text(encoding="utf-8"))
    importados = set()
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Import):
            importados.update(alias.name for alias in nodo.names)
        elif isinstance(nodo, ast.ImportFrom) and nodo.module:
            importados.add(nodo.module)
    raices = {nombre.split(".")[0] for nombre in importados}
    assert not raices & {"fastapi", "starlette"}, f"{modulo} importa {raices & {'fastapi', 'starlette'}}"
