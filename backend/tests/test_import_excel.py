"""
Import por Excel (.xlsx) de la rúbrica (POST .../criterios/importar-excel, vista previa
que se confirma con PUT /criterios) y de estudiantes (POST .../estudiantes/csv y
.../estudiantes/vista-previa): cada Excel debe dar lo mismo que su CSV equivalente.

Los .xlsx se generan en memoria con openpyxl. Reutiliza las fixtures de SQLite.
"""
import io
from decimal import Decimal

import pytest
from openpyxl import Workbook

from app.models import Actividad, Curso, Seccion
from app.models.actividad import TipoActividad
from app.utils.excel_parser import ExcelParserError, parsear_excel_criterios
from tests.test_catalogo_ra_abet import MOCK_USER, client, db_session  # noqa: F401 (fixtures)

MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _xlsx(filas, fusionar=()):
    """Bytes de un .xlsx con `filas` (la primera es el encabezado); `fusionar` son rangos tipo 'A2:A3'."""
    wb = Workbook()
    ws = wb.active
    for fila in filas:
        ws.append(list(fila))
    for rango in fusionar:
        ws.merge_cells(rango)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _subir_xlsx(contenido, nombre="archivo.xlsx"):
    return {"archivo": (nombre, contenido, MIME_XLSX)}


# ── Rúbrica ──────────────────────────────────────────────────────────────────

RUBRICA_EXCEL = [
    ("Aspecto", "Criterio", "%Criterio", "Grupo1", "Calificación"),
    ("Diseño", "Diagrama completo", 30, None, None),
    (None, "Justificación", 20, None, None),  # celda fusionada con la de arriba
    ("Implementación", "Compila", 25, None, None),
    ("Implementación", "Pruebas", 25, None, None),
]

# Payload que produce el import por CSV (frontend) con el CSV equivalente:
# Aspecto,Criterio,Peso / Diseño,Diagrama completo,30 / Diseño,Justificación,20 / ...
PAYLOAD_CSV = {
    "aspectos": [
        {"nombre": "Diseño", "orden": 0, "criterios": [
            {"texto": "Diagrama completo", "peso_porcentaje": 30, "orden": 0},
            {"texto": "Justificación", "peso_porcentaje": 20, "orden": 1},
        ]},
        {"nombre": "Implementación", "orden": 1, "criterios": [
            {"texto": "Compila", "peso_porcentaje": 25, "orden": 0},
            {"texto": "Pruebas", "peso_porcentaje": 25, "orden": 1},
        ]},
    ]
}


def _nueva_actividad(db_session, nombre="Lab 1"):
    curso = db_session.query(Curso).first()
    if curso is None:
        curso = Curso(nombre="Redes", codigo="R-1", periodo="2026-2", docente_email=MOCK_USER["email"])
        db_session.add(curso)
        db_session.flush()
    act = Actividad(nombre=nombre, tipo=TipoActividad.individual, peso_nota_final=20, curso_id=curso.id)
    db_session.add(act)
    db_session.commit()
    return act


def _payload_desde_preview(preview):
    """Lo que hace RubricaPage al pulsar 'Importar al borrador' y luego 'Guardar rúbrica'."""
    return {
        "aspectos": [
            {
                "nombre": a["nombre"],
                "orden": i,
                "codigo_abet": None,
                "criterios": [
                    {"texto": c["texto"], "peso_porcentaje": c["peso_porcentaje"], "orden": j}
                    for j, c in enumerate(a["criterios"])
                ],
            }
            for i, a in enumerate(preview["aspectos"])
        ]
    }


def _estructura(client, actividad_id):
    """Rúbrica guardada, sin ids, para comparar dos actividades."""
    resp = client.get(f"/actividades/{actividad_id}/criterios").json()
    return {
        "total_peso": float(resp["total_peso"]),
        "aspectos": [
            {
                "nombre": a["nombre"],
                "orden": a["orden"],
                "codigo_abet": a["codigo_abet"],
                "criterios": [(c["texto"], float(c["peso_porcentaje"]), c["orden"]) for c in a["criterios"]],
            }
            for a in resp["aspectos"]
        ],
    }


class TestRubricaExcel:
    def test_excel_valido_se_importa_igual_que_su_csv(self, client, db_session):
        act_excel = _nueva_actividad(db_session, "Lab Excel")
        act_csv = _nueva_actividad(db_session, "Lab CSV")

        resp = client.post(
            f"/actividades/{act_excel.id}/criterios/importar-excel",
            files=_subir_xlsx(_xlsx(RUBRICA_EXCEL, fusionar=["A2:A3"])),
        )
        assert resp.status_code == 200
        preview = resp.json()
        assert float(preview["total_peso"]) == 100
        assert [a["nombre"] for a in preview["aspectos"]] == ["Diseño", "Implementación"]

        # La vista previa no guarda nada
        assert client.get(f"/actividades/{act_excel.id}/criterios").json()["aspectos"] == []

        assert client.put(
            f"/actividades/{act_excel.id}/criterios", json=_payload_desde_preview(preview)
        ).status_code == 200
        assert client.put(f"/actividades/{act_csv.id}/criterios", json=PAYLOAD_CSV).status_code == 200

        assert _estructura(client, act_excel.id) == _estructura(client, act_csv.id)

    def test_aspecto_en_celda_vacia_se_propaga_y_filas_vacias_se_omiten(self, client, db_session):
        act = _nueva_actividad(db_session)
        filas = [
            ("Aspecto", "Criterio", "%Criterio"),
            ("Diseño", "A", 60),
            (None, "B", 40),  # vacía sin fusionar: llega como None, igual que una fusionada
            (None, None, None),
        ]
        resp = client.post(f"/actividades/{act.id}/criterios/importar-excel", files=_subir_xlsx(_xlsx(filas)))
        assert resp.status_code == 200
        aspectos = resp.json()["aspectos"]
        assert len(aspectos) == 1
        assert aspectos[0]["nombre"] == "Diseño"
        assert [c["texto"] for c in aspectos[0]["criterios"]] == ["A", "B"]

    def test_pesos_que_no_suman_100(self, client, db_session):
        act = _nueva_actividad(db_session)
        filas = [("Aspecto", "Criterio", "%Criterio"), ("Diseño", "A", 60), ("Diseño", "B", 30)]
        resp = client.post(f"/actividades/{act.id}/criterios/importar-excel", files=_subir_xlsx(_xlsx(filas)))
        assert resp.status_code == 422
        assert "suman 90" in resp.json()["detail"]

    def test_archivo_que_no_es_excel(self, client, db_session):
        act = _nueva_actividad(db_session)
        resp = client.post(
            f"/actividades/{act.id}/criterios/importar-excel",
            files=_subir_xlsx(b"Aspecto,Criterio,Peso\nA,x,100\n"),
        )
        assert resp.status_code == 422
        assert "No se pudo leer" in resp.json()["detail"]


class TestParserExcelCriterios:
    """parsear_excel_criterios sobre .xlsx reales (lo que antes resolvía pandas)."""

    def test_aspecto_numerico_sin_punto_cero(self):
        filas = [("Aspecto", "Criterio", "%Criterio"), (1, "A", 50), (2.0, "B", 50)]
        assert [a["nombre"] for a in parsear_excel_criterios(_xlsx(filas))["aspectos"]] == ["1", "2"]

    def test_texto_que_parece_numero_se_conserva(self):
        # pandas convertía el texto "007" en 7 y "10.50" en 10.5
        filas = [("Aspecto", "Criterio", "%Criterio"), ("10.50", "007", 100)]
        aspecto = parsear_excel_criterios(_xlsx(filas))["aspectos"][0]
        assert (aspecto["nombre"], aspecto["criterios"][0]["texto"]) == ("10.50", "007")

    def test_peso_como_texto_o_float(self):
        filas = [("Aspecto", "Criterio", "%Criterio"), ("X", "A", "40"), (None, "B", 59.5), (None, "C", " 0.5 ")]
        resultado = parsear_excel_criterios(_xlsx(filas))
        assert [c["peso_porcentaje"] for c in resultado["aspectos"][0]["criterios"]] == [
            Decimal("40.00"), Decimal("59.50"), Decimal("0.50"),
        ]
        assert resultado["total_peso"] == Decimal("100.00")

    def test_peso_vacio(self):
        filas = [("Aspecto", "Criterio", "%Criterio"), ("X", "A", None)]
        with pytest.raises(ExcelParserError, match="^Fila 2: falta el peso$"):
            parsear_excel_criterios(_xlsx(filas))

    def test_peso_no_numerico(self):
        filas = [("Aspecto", "Criterio", "%Criterio"), ("X", "A", "diez")]
        with pytest.raises(ExcelParserError, match="^Fila 2: el peso 'diez' no es un número válido$"):
            parsear_excel_criterios(_xlsx(filas))

    def test_encabezado_mas_corto_que_los_datos(self):
        assert parsear_excel_criterios(_xlsx([("Aspecto", "Criterio"), ("X", "A", 100)]))["total_peso"] == 100

    def test_menos_de_tres_columnas(self):
        with pytest.raises(ExcelParserError, match="al menos 3 columnas"):
            parsear_excel_criterios(_xlsx([("Aspecto", "Criterio"), ("X", "A")]))


# ── Estudiantes ──────────────────────────────────────────────────────────────

CSV_ESTUDIANTES = "Nombre,Codigo\nOscar Evelio Prada,2021001\nAna Ruiz,2021002\n"


@pytest.fixture()
def secciones(db_session):
    curso = Curso(nombre="Redes", codigo="R-1", periodo="2026-2", docente_email=MOCK_USER["email"])
    db_session.add(curso)
    db_session.flush()
    s1, s2 = Seccion(nombre="S1", curso_id=curso.id), Seccion(nombre="S2", curso_id=curso.id)
    db_session.add_all([s1, s2])
    db_session.commit()
    return s1, s2


def _listado(client, seccion_id):
    return sorted(
        (e["nombre_completo"], e["codigo_estudiante"])
        for e in client.get(f"/secciones/{seccion_id}/estudiantes").json()
    )


class TestEstudiantesExcel:
    def test_excel_se_importa_igual_que_su_csv(self, client, secciones):
        s_csv, s_excel = secciones
        # Código numérico en el Excel: debe guardarse "2021001", no "2021001.0"
        contenido = _xlsx([("Nombre", "Código"), ("Oscar Evelio Prada", 2021001), ("Ana Ruiz", "2021002")])

        r_csv = client.post(
            f"/secciones/{s_csv.id}/estudiantes/csv",
            files={"archivo": ("e.csv", CSV_ESTUDIANTES.encode(), "text/csv")},
        )
        r_excel = client.post(f"/secciones/{s_excel.id}/estudiantes/csv", files=_subir_xlsx(contenido))

        assert r_csv.status_code == r_excel.status_code == 201
        assert r_excel.json() == r_csv.json() == {"importados": 2, "errores": []}
        assert _listado(client, s_excel.id) == _listado(client, s_csv.id) == [
            ("ANA RUIZ", "2021002"), ("OSCAR EVELIO PRADA", "2021001"),
        ]

    def test_excel_detectado_por_content_type(self, client, secciones):
        s1, _ = secciones
        contenido = _xlsx([("Nombre", "Codigo"), ("Ana Ruiz", "1")])
        resp = client.post(f"/secciones/{s1.id}/estudiantes/csv", files=_subir_xlsx(contenido, nombre="lista"))
        assert resp.json()["importados"] == 1

    def test_excel_filas_vacias_reportan_error_igual_que_csv(self, client, secciones):
        s1, _ = secciones
        contenido = _xlsx([("Nombre", "Codigo"), ("Ana Ruiz", "1"), ("Sin código", None)])
        resp = client.post(f"/secciones/{s1.id}/estudiantes/csv", files=_subir_xlsx(contenido))
        assert resp.json() == {"importados": 1, "errores": ["Fila 3: nombre o código vacío, se omite"]}

    def test_vista_previa_excel_no_guarda(self, client, secciones):
        s1, _ = secciones
        contenido = _xlsx([("Nombre", "Código"), ("Ana Ruiz", 2021002), ("Sin código", None)])
        resp = client.post(f"/secciones/{s1.id}/estudiantes/vista-previa", files=_subir_xlsx(contenido))
        assert resp.status_code == 200
        assert resp.json() == {
            "estudiantes": [{"nombre": "ANA RUIZ", "codigo": "2021002", "email": None}],
            "errores": ["Fila 3: nombre o código vacío, se omite"],
        }
        assert client.get(f"/secciones/{s1.id}/estudiantes").json() == []
