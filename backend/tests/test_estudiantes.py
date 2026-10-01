"""
Endpoints de estudiantes (routers/estudiantes.py) vistos por HTTP: lo que no cubren
test_editar_estudiante, test_exportar_estudiantes, test_import_excel ni
test_importar_formato_lista. Fija los códigos de estado y los mensajes exactos que
recibe el usuario, y la eliminación (que no tenía tests).

Reutiliza las fixtures de SQLite en memoria y los helpers de test_exportar_estudiantes.
"""
from io import BytesIO

import pytest
from openpyxl import Workbook

from app.models import Calificacion, Estudiante
from tests.test_catalogo_ra_abet import MOCK_USER, client, db_session  # noqa: F401 (fixtures)
from tests.test_exportar_estudiantes import MIME_XLSX, _curso, _est
from tests.test_reportes import _actividad, _calificar

OTRO = "otro@uao.edu.co"
SECCION_NO_ENCONTRADA = {"detail": "Sección no encontrada"}
SECCION_SIN_PERMISO = {"detail": "No tiene permiso sobre esta sección"}
ESTUDIANTE_NO_ENCONTRADO = {"detail": "Estudiante no encontrado"}


def _csv(texto="Nombre,Codigo\nAna Ruiz,1\n"):
    return {"archivo": ("lista.csv", texto.encode(), "text/csv")}


def _xlsx(filas):
    wb = Workbook()
    for fila in filas:
        wb.active.append(fila)
    salida = BytesIO()
    wb.save(salida)
    return {"archivo": ("lista.xlsx", salida.getvalue(), MIME_XLSX)}


# (método, ruta con {id}, kwargs de la petición) de los endpoints que reciben la sección
POR_SECCION = [
    ("get", "/secciones/{id}/estudiantes", {}),
    ("post", "/secciones/{id}/estudiantes", {"json": {"nombre_completo": "Ana", "codigo_estudiante": "1"}}),
    ("post", "/secciones/{id}/estudiantes/csv", {"files": _csv()}),
    ("post", "/secciones/{id}/estudiantes/vista-previa", {"files": _csv()}),
]
IDS_POR_SECCION = ["listar", "agregar", "importar", "vista-previa"]


def _contar(db_session, seccion):
    return db_session.query(Estudiante).filter_by(seccion_id=seccion.id).count()


# ── Sección inexistente o de otro docente ────────────────────────────────────

@pytest.mark.parametrize("metodo,ruta,kwargs", POR_SECCION, ids=IDS_POR_SECCION)
def test_seccion_inexistente_404(client, metodo, ruta, kwargs):
    resp = getattr(client, metodo)(ruta.format(id=99999), **kwargs)
    assert resp.status_code == 404
    assert resp.json() == SECCION_NO_ENCONTRADA


@pytest.mark.parametrize("metodo,ruta,kwargs", POR_SECCION, ids=IDS_POR_SECCION)
def test_seccion_de_otro_docente_403_sin_guardar(client, db_session, metodo, ruta, kwargs):
    _, [ajena] = _curso(db_session, "Ajena", "A-1", email=OTRO)
    resp = getattr(client, metodo)(ruta.format(id=ajena.id), **kwargs)
    assert resp.status_code == 403
    assert resp.json() == SECCION_SIN_PERMISO
    assert _contar(db_session, ajena) == 0


# ── Editar: mensajes de 404 y 403 ────────────────────────────────────────────

class TestEditarErrores:
    def test_inexistente_404(self, client):
        resp = client.put("/estudiantes/99999", json={"nombre_completo": "X"})
        assert resp.status_code == 404
        assert resp.json() == ESTUDIANTE_NO_ENCONTRADO

    def test_de_otro_docente_403(self, client, db_session):
        _, [ajena] = _curso(db_session, "Ajena", "A-1", email=OTRO)
        zoe = _est(db_session, ajena, "ZOE", "9")
        resp = client.put(f"/estudiantes/{zoe.id}", json={"nombre_completo": "X"})
        assert resp.status_code == 403
        assert resp.json() == {"detail": "No tiene permiso para editar este estudiante"}


# ── Eliminar ─────────────────────────────────────────────────────────────────

class TestEliminar:
    def test_elimina_y_borra_sus_calificaciones_individuales(self, client, db_session):
        curso, [s1] = _curso(db_session)
        ana = _est(db_session, s1, "ANA", "1")
        beto = _est(db_session, s1, "BETO", "2")
        _, [criterios] = _actividad(db_session, curso, [(None, [100])])
        _calificar(db_session, criterios, [1], estudiante=ana)
        _calificar(db_session, criterios, [0], estudiante=beto)

        resp = client.delete(f"/estudiantes/{ana.id}")
        assert resp.status_code == 204
        db_session.expire_all()
        assert db_session.get(Estudiante, ana.id) is None
        assert [c.estudiante_id for c in db_session.query(Calificacion).all()] == [beto.id]

    def test_inexistente_404(self, client):
        resp = client.delete("/estudiantes/99999")
        assert resp.status_code == 404
        assert resp.json() == ESTUDIANTE_NO_ENCONTRADO

    def test_de_otro_docente_403_sin_borrar(self, client, db_session):
        _, [ajena] = _curso(db_session, "Ajena", "A-1", email=OTRO)
        zoe = _est(db_session, ajena, "ZOE", "9")
        resp = client.delete(f"/estudiantes/{zoe.id}")
        assert resp.status_code == 403
        assert resp.json() == {"detail": "No tiene permiso para eliminar este estudiante"}
        assert db_session.get(Estudiante, zoe.id) is not None


# ── Importar y vista previa: archivo no válido (422) ─────────────────────────

@pytest.mark.parametrize("endpoint", ["csv", "vista-previa"])
class TestArchivoInvalido:
    def test_csv_sin_columnas_obligatorias(self, client, db_session, endpoint):
        _, [s1] = _curso(db_session)
        resp = client.post(f"/secciones/{s1.id}/estudiantes/{endpoint}", files=_csv("Nombre,Correo\nAna,a@x.co\n"))
        assert resp.status_code == 422
        assert resp.json() == {
            "detail": "El CSV debe tener columnas 'Nombre' y 'Codigo' (o 'Código', o 'Número de ID')"
        }
        assert _contar(db_session, s1) == 0

    def test_excel_sin_columnas_obligatorias(self, client, db_session, endpoint):
        _, [s1] = _curso(db_session)
        resp = client.post(
            f"/secciones/{s1.id}/estudiantes/{endpoint}", files=_xlsx([("Nombre", "Correo"), ("Ana", "a@x.co")])
        )
        assert resp.status_code == 422
        assert resp.json() == {
            "detail": "El Excel debe tener columnas 'Nombre' y 'Codigo' (o 'Código', o 'Número de ID')"
        }
        assert _contar(db_session, s1) == 0

    def test_excel_ilegible(self, client, db_session, endpoint):
        _, [s1] = _curso(db_session)
        resp = client.post(
            f"/secciones/{s1.id}/estudiantes/{endpoint}",
            files={"archivo": ("lista.xlsx", b"Nombre,Codigo\nAna,1\n", MIME_XLSX)},
        )
        assert resp.status_code == 422
        assert resp.json()["detail"].startswith("No se pudo leer el archivo Excel: ")
        assert _contar(db_session, s1) == 0


# ── Exportar: mensajes de 404 y 403 ──────────────────────────────────────────

class TestExportarErrores:
    def _exportar(self, client, **params):
        return client.get("/estudiantes/exportar-excel", params=params)

    def test_asignatura_inexistente(self, client):
        resp = self._exportar(client, curso_id=99999)
        assert (resp.status_code, resp.json()) == (404, {"detail": "Asignatura no encontrada"})

    def test_asignatura_de_otro_docente(self, client, db_session):
        ajeno, _ = _curso(db_session, "Ajena", "A-1", email=OTRO)
        resp = self._exportar(client, curso_id=ajeno.id)
        assert (resp.status_code, resp.json()) == (403, {"detail": "No tiene permiso sobre esta asignatura"})

    def test_seccion_inexistente(self, client):
        resp = self._exportar(client, seccion_id=99999)
        assert (resp.status_code, resp.json()) == (404, SECCION_NO_ENCONTRADA)

    def test_seccion_de_otro_docente(self, client, db_session):
        _, [ajena] = _curso(db_session, "Ajena", "A-1", email=OTRO)
        resp = self._exportar(client, seccion_id=ajena.id)
        assert (resp.status_code, resp.json()) == (403, SECCION_SIN_PERMISO)

    def test_seccion_de_otra_asignatura(self, client, db_session):
        redes, _ = _curso(db_session, "Redes", "R-1")
        _, [b1] = _curso(db_session, "Bases de Datos", "BD-1")
        resp = self._exportar(client, curso_id=redes.id, seccion_id=b1.id)
        assert (resp.status_code, resp.json()) == (404, {"detail": "Sección no encontrada en esta asignatura"})
