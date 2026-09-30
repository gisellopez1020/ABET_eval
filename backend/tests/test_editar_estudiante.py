"""
Edición de estudiantes (PUT /estudiantes/{id}): nombre, código y correo; solo cambia
lo enviado. Un correo no válido no bloquea la edición: se conserva el anterior (o queda
en blanco si no había) y la respuesta trae un aviso. No toca sección, equipos ni notas.

Reutiliza las fixtures de SQLite en memoria y los helpers de test_exportar_estudiantes.
"""
import pytest

from app.models import Calificacion, EquipoTrabajo, Estudiante, MiembroEquipo
from app.models.actividad import TipoActividad
from tests.test_catalogo_ra_abet import MOCK_USER, client, db_session  # noqa: F401 (fixtures)
from tests.test_exportar_estudiantes import _curso, _est
from tests.test_reportes import _actividad, _calificar


def _editar(client, estudiante, **body):
    return client.put(f"/estudiantes/{estudiante.id}", json=body)


def _guardado(db_session, estudiante):
    db_session.expire_all()
    e = db_session.get(Estudiante, estudiante.id)
    return e.nombre_completo, e.codigo_estudiante, e.email


@pytest.fixture()
def ana(db_session):
    _, [s1] = _curso(db_session)
    return _est(db_session, s1, "ANA RUIZ", "2021001", "ana@uao.edu.co")


class TestEditar:
    def test_nombre_y_correo_se_actualizan_y_salen_en_el_listado(self, client, db_session, ana):
        resp = _editar(client, ana, nombre_completo="  Ana María Ruiz Díaz ", email=" Ana.Maria@UAO.edu.co ")
        assert resp.status_code == 200
        datos = resp.json()
        assert (datos["id"], datos["nombre_completo"], datos["email"], datos["aviso"]) == (
            ana.id, "ANA MARÍA RUIZ DÍAZ", "ana.maria@uao.edu.co", None,
        )
        assert _guardado(db_session, ana) == ("ANA MARÍA RUIZ DÍAZ", "2021001", "ana.maria@uao.edu.co")

        [listado] = client.get(f"/secciones/{ana.seccion_id}/estudiantes").json()
        assert (listado["nombre_completo"], listado["email"]) == ("ANA MARÍA RUIZ DÍAZ", "ana.maria@uao.edu.co")

    def test_solo_cambia_los_campos_enviados(self, client, db_session, ana):
        assert _editar(client, ana, email="nuevo@uao.edu.co").status_code == 200
        assert _guardado(db_session, ana) == ("ANA RUIZ", "2021001", "nuevo@uao.edu.co")

        assert _editar(client, ana, nombre_completo="Ana Ruiz Díaz").status_code == 200
        assert _guardado(db_session, ana) == ("ANA RUIZ DÍAZ", "2021001", "nuevo@uao.edu.co")

    def test_cargar_correo_a_un_estudiante_que_no_tenia(self, client, db_session):
        _, [s1] = _curso(db_session)
        beto = _est(db_session, s1, "BETO DIAZ", "2")
        resp = _editar(client, beto, email="beto@uao.edu.co")
        assert (resp.json()["email"], resp.json()["aviso"]) == ("beto@uao.edu.co", None)

    def test_codigo_editable_aunque_otro_lo_tenga(self, client, db_session, ana):
        """Hoy el código no es único (ni en la base ni en la importación): editar no lo exige."""
        otro = _est(db_session, db_session.get(Estudiante, ana.id).seccion, "BETO DIAZ", "2021002")
        resp = _editar(client, ana, codigo_estudiante=" 2021002 ")
        assert resp.status_code == 200
        assert _guardado(db_session, ana)[1] == "2021002"
        assert _guardado(db_session, otro)[1] == "2021002"

    @pytest.mark.parametrize("vacio", [None, "", "   "], ids=["null", "vacio", "espacios"])
    def test_correo_null_o_vacio_lo_borra(self, client, db_session, ana, vacio):
        resp = _editar(client, ana, email=vacio)
        assert resp.status_code == 200
        assert (resp.json()["email"], resp.json()["aviso"]) == (None, None)
        assert _guardado(db_session, ana)[2] is None

    def test_body_vacio_no_cambia_nada(self, client, db_session, ana):
        assert _editar(client, ana).status_code == 200
        assert _guardado(db_session, ana) == ("ANA RUIZ", "2021001", "ana@uao.edu.co")


class TestCorreoInvalido:
    @pytest.mark.parametrize("invalido", ["ana ruiz", "ana@", "ana.uao.edu.co"])
    def test_conserva_el_correo_anterior_y_avisa(self, client, db_session, ana, invalido):
        resp = _editar(client, ana, email=invalido)
        assert resp.status_code == 200
        assert resp.json()["email"] == "ana@uao.edu.co"
        assert resp.json()["aviso"] == f"El correo '{invalido}' no es válido, se conservó el anterior"
        assert _guardado(db_session, ana)[2] == "ana@uao.edu.co"

    def test_sin_correo_anterior_queda_en_blanco_como_en_el_alta(self, client, db_session):
        _, [s1] = _curso(db_session)
        beto = _est(db_session, s1, "BETO DIAZ", "2")
        resp = _editar(client, beto, email="beto diaz")
        assert resp.status_code == 200
        assert resp.json()["email"] is None
        assert resp.json()["aviso"] == "El correo 'beto diaz' no es válido, se dejó en blanco"

    def test_no_bloquea_el_resto_de_la_edicion(self, client, db_session, ana):
        resp = _editar(client, ana, nombre_completo="Ana Ruiz Díaz", codigo_estudiante="99", email="mal")
        assert resp.status_code == 200
        assert resp.json()["aviso"] is not None
        assert _guardado(db_session, ana) == ("ANA RUIZ DÍAZ", "99", "ana@uao.edu.co")


class TestValidacionYPermisos:
    @pytest.mark.parametrize("campo", ["nombre_completo", "codigo_estudiante"])
    @pytest.mark.parametrize("valor", [None, "", "   "], ids=["null", "vacio", "espacios"])
    def test_nombre_o_codigo_vacio_422_sin_guardar_nada(self, client, db_session, ana, campo, valor):
        resp = _editar(client, ana, **{campo: valor}, email="otro@uao.edu.co")
        assert resp.status_code == 422
        assert _guardado(db_session, ana) == ("ANA RUIZ", "2021001", "ana@uao.edu.co")

    def test_estudiante_inexistente_404(self, client):
        assert client.put("/estudiantes/99999", json={"nombre_completo": "X"}).status_code == 404

    def test_estudiante_de_otro_docente_403_sin_modificar(self, client, db_session):
        _, [ajena] = _curso(db_session, "Ajena", "A-1", email="otro@uao.edu.co")
        zoe = _est(db_session, ajena, "ZOE ARIAS", "9", "zoe@uao.edu.co")
        resp = _editar(client, zoe, nombre_completo="Hackeada", email="x@y.co")
        assert resp.status_code == 403
        assert _guardado(db_session, zoe) == ("ZOE ARIAS", "9", "zoe@uao.edu.co")

    def test_la_seccion_no_se_puede_cambiar(self, client, db_session):
        _, [s1, s2] = _curso(db_session, secciones=("S1", "S2"))
        ana = _est(db_session, s1, "ANA RUIZ", "1")
        resp = client.put(f"/estudiantes/{ana.id}", json={"seccion_id": s2.id, "nombre_completo": "Ana Ruiz"})
        assert resp.status_code == 200
        assert resp.json()["seccion_id"] == s1.id


def test_editar_conserva_calificaciones_y_equipos(client, db_session):
    """El motivo de este endpoint: corregir datos sin borrar al estudiante y perder sus notas."""
    curso, [s1] = _curso(db_session)
    ana = _est(db_session, s1, "ANA RUIZ", "1")
    individual, [crits] = _actividad(db_session, curso, [(None, [40, 60])])
    grupal, _ = _actividad(db_session, curso, [(None, [100])], tipo=TipoActividad.grupal)
    _calificar(db_session, crits, [1, 0], estudiante=ana)
    equipo = EquipoTrabajo(nombre="E1", actividad_id=grupal.id, seccion_id=s1.id)
    db_session.add(equipo)
    db_session.flush()
    db_session.add(MiembroEquipo(equipo_id=equipo.id, estudiante_id=ana.id))
    db_session.commit()

    resp = _editar(client, ana, nombre_completo="Ana Ruiz Díaz", codigo_estudiante="2", email="ana@uao.edu.co")
    assert resp.status_code == 200

    db_session.expire_all()
    assert db_session.query(Calificacion).filter_by(estudiante_id=ana.id).count() == 2
    assert db_session.query(MiembroEquipo).filter_by(estudiante_id=ana.id).count() == 1
    # El promedio del listado sigue saliendo de las mismas calificaciones
    [listado] = client.get(f"/secciones/{s1.id}/estudiantes").json()
    assert listado["nombre_completo"] == "ANA RUIZ DÍAZ"
    assert listado["promedio"] is not None
