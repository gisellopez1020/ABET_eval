"""
Lectura de listas de estudiantes (services/lista_estudiantes.py) sin BD ni HTTP:
bytes de entrada, (válidos, avisos) o ArchivoInvalido de salida.
"""
import io

import pytest
from openpyxl import Workbook

from app.services.errores import ArchivoInvalido, DatosInvalidos
from app.services.lista_estudiantes import MIME_XLSX, es_excel, leer_lista, normalizar_email


def _xlsx(filas, fusionar=()):
    wb = Workbook()
    for fila in filas:
        wb.active.append(fila)
    for rango in fusionar:
        wb.active.merge_cells(rango)
    salida = io.BytesIO()
    wb.save(salida)
    return salida.getvalue()


class TestNormalizarEmail:
    @pytest.mark.parametrize("crudo,esperado", [
        ("  Ana@UAO.edu.co ", ("ana@uao.edu.co", False)),
        (None, (None, False)),
        ("   ", (None, False)),
        ("ana@", (None, True)),
        ("ana uao@x.co", (None, True)),
    ])
    def test_casos(self, crudo, esperado):
        assert normalizar_email(crudo) == esperado


class TestEsExcel:
    @pytest.mark.parametrize("nombre,tipo,esperado", [
        ("Lista.XLSX", None, True),
        ("lista", MIME_XLSX, True),
        ("lista.csv", "text/csv", False),
        (None, None, False),
    ])
    def test_por_extension_o_content_type(self, nombre, tipo, esperado):
        assert es_excel(nombre, tipo) is esperado


class TestFormatoSimple:
    def test_csv_con_correo_valido_e_invalido(self):
        csv = b"Nombre,Codigo,Email\nAna Ruiz,1, Ana@UAO.edu.co \nBeto,2,beto@\n"
        validos, avisos = leer_lista(csv, "l.csv", "text/csv")
        assert validos == [("ANA RUIZ", "1", "ana@uao.edu.co"), ("BETO", "2", None)]
        assert avisos == ["Fila 3: correo 'beto@' no válido, se deja en blanco"]

    def test_excel_conserva_codigos_como_texto(self):
        contenido = _xlsx([("Nombre", "Codigo"), ("Ana", 2021001)])
        assert leer_lista(contenido, "l.xlsx", None) == ([("ANA", "2021001", None)], [])


class TestExcel:
    """Casos que pandas resolvía solo (dtype=str, keep_default_na=False) y ahora hace openpyxl."""

    def test_codigos_numericos_sin_punto_cero_y_con_ceros_a_la_izquierda(self):
        contenido = _xlsx([("Nombre", "Codigo"), ("Ana", 2021001.0), ("Beto", "0012"), ("Cira", 2.5e6)])
        validos, _ = leer_lista(contenido, "l.xlsx", None)
        assert [codigo for _, codigo, _ in validos] == ["2021001", "0012", "2500000"]

    def test_fila_vacia_intermedia_se_avisa_con_su_numero_de_fila(self):
        contenido = _xlsx([("Nombre", "Codigo"), ("Ana", "1"), (None, None), ("Eva", "3")])
        assert leer_lista(contenido, "l.xlsx", None) == (
            [("ANA", "1", None), ("EVA", "3", None)],
            ["Fila 3: nombre o código vacío, se omite"],
        )

    def test_nombre_fusionado_queda_vacio_como_en_pandas(self):
        contenido = _xlsx([("Nombre", "Codigo"), ("Ana", "1"), (None, "2")], fusionar=["A2:A3"])
        assert leer_lista(contenido, "l.xlsx", None) == (
            [("ANA", "1", None)], ["Fila 3: nombre o código vacío, se omite"],
        )

    def test_encabezados_repetidos_o_vacios_usan_la_primera_columna(self):
        contenido = _xlsx([("Nombre", None, "Codigo", "Nombre"), ("Ana", "x", "1", "OTRO")])
        assert leer_lista(contenido, "l.xlsx", None) == ([("ANA", "1", None)], [])

    def test_formato_institucional_con_grupo_numerico(self):
        contenido = _xlsx([
            ("Nombre", "Apellido(s)", "Número de ID", "Dirección de correo", "Grupo"),
            ("Ana", "Ruiz", 2021001, None, 1),
        ])
        assert leer_lista(contenido, "l.xlsx", None, seccion_nombre="1") == ([("ANA RUIZ", "2021001", None)], [])


class TestFormatoInstitucional:
    ENCABEZADO = "Nombre,Apellido(s),Número de ID,Dirección de correo,Grupo\n"

    def test_une_apellidos_y_avisa_grupo_distinto(self):
        csv = (self.ENCABEZADO + "Ana,Ruiz,1,ana@uao.edu.co,S1\nBeto,Diaz,2,,G2\nCira,Paz,3,,G2\n").encode()
        validos, avisos = leer_lista(csv, "l.csv", "text/csv", seccion_nombre="S1")
        assert validos == [("ANA RUIZ", "1", "ana@uao.edu.co"), ("BETO DIAZ", "2", None), ("CIRA PAZ", "3", None)]
        assert avisos == ["2 filas tienen Grupo 'G2', distinto de esta sección ('S1'); se importan igual"]

    def test_sin_seccion_no_compara_el_grupo(self):
        csv = (self.ENCABEZADO + "Ana,Ruiz,1,,G2\n").encode()
        assert leer_lista(csv, "l.csv", "text/csv")[1] == []


class TestArchivoInvalido:
    def test_csv_sin_columnas(self):
        with pytest.raises(ArchivoInvalido, match=r"^El CSV debe tener columnas 'Nombre' y 'Codigo'"):
            leer_lista(b"Nombre,Correo\nAna,a@x.co\n", "l.csv", "text/csv")

    def test_excel_sin_columnas(self):
        with pytest.raises(ArchivoInvalido, match=r"^El Excel debe tener columnas 'Nombre' y 'Codigo'"):
            leer_lista(_xlsx([("Nombre", "Correo")]), "l.xlsx", None)

    def test_excel_ilegible(self):
        with pytest.raises(ArchivoInvalido, match="^No se pudo leer el archivo Excel: "):
            leer_lista(b"no es un excel", "l.xlsx", None)

    def test_excel_vacio(self):
        with pytest.raises(ArchivoInvalido, match=r"^El Excel debe tener columnas 'Nombre' y 'Codigo'"):
            leer_lista(_xlsx([]), "l.xlsx", None)

    def test_es_datos_invalidos(self):
        assert issubclass(ArchivoInvalido, DatosInvalidos)
