"""
Lectura de listas de estudiantes (services/lista_estudiantes.py) sin BD ni HTTP:
bytes de entrada, (válidos, avisos) o ArchivoInvalido de salida.
"""
import io

import pytest
from openpyxl import Workbook

from app.services.errores import ArchivoInvalido, DatosInvalidos
from app.services.lista_estudiantes import (
    MIME_XLSX, EnSeccion, Omitido, es_excel, leer_lista, leer_lista_con_filas, normalizar_codigo, normalizar_email,
    separar_repetidos,
)


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


# ── Repetidos: normalización del código y separación ─────────────────────────

class TestNormalizarCodigo:
    @pytest.mark.parametrize("crudo,esperado", [
        (" 2021001 ", "2021001"),
        ("20 21 001", "2021001"),
        ("00123", "123"),
        ("123", "123"),
        ("000", "0"),
        ("ab-12", "AB-12"),
        (" Ab 012 ", "AB012"),  # con letras no se tocan los ceros
        ("0A12", "0A12"),
        ("١٢٣", "١٢٣"),  # dígitos no ASCII: no se tratan como número
    ])
    def test_casos(self, crudo, esperado):
        assert normalizar_codigo(crudo) == esperado


def _filas(*estudiantes):
    """[(fila, (nombre, código, None))] numeradas desde la 2, como en el archivo."""
    return [(i, (n, c, None)) for i, (n, c) in enumerate(estudiantes, start=2)]


class TestSepararRepetidos:
    def test_sin_repetidos_no_cambia_nada(self):
        validos = _filas(("ANA", "1"), ("BETO", "2"))
        assert separar_repetidos(validos, []) == ([("ANA", "1", None), ("BETO", "2", None)], [], [])

    def test_repetido_contra_la_seccion_con_nombre_distinto(self):
        a_importar, omitidos, avisos = separar_repetidos(
            _filas(("ANA R", " 00123 "), ("BETO", "2")), [EnSeccion("123", "ANA RUIZ")],
        )
        assert a_importar == [("BETO", "2", None)]
        assert omitidos == [Omitido(2, "ANA R", " 00123 ", "en_seccion", "ANA RUIZ")]
        assert avisos == ["Se omite 1 estudiante cuyo código ya está en la sección:  00123 "]

    def test_repetido_dentro_del_archivo_gana_la_primera(self):
        a_importar, omitidos, avisos = separar_repetidos(
            _filas(("ANA", "ab1"), ("BETO", "2"), ("ANITA", "AB 1"), ("ANA", "AB1")), [],
        )
        assert a_importar == [("ANA", "ab1", None), ("BETO", "2", None)]
        assert omitidos == [
            Omitido(4, "ANITA", "AB 1", "en_archivo", "ANA", 2),
            Omitido(5, "ANA", "AB1", "en_archivo", "ANA", 2),
        ]
        assert avisos == [
            "Se omiten 2 filas con un código repetido en el archivo (se conserva la primera): filas 4, 5"
        ]

    def test_la_seccion_gana_al_archivo(self):
        """Si el código ya está guardado, todas las filas que lo traen son 'en_seccion'."""
        _, omitidos, _ = separar_repetidos(_filas(("ANA", "1"), ("ANA", "1")), [EnSeccion("1", "ANA")])
        assert [o.motivo for o in omitidos] == ["en_seccion", "en_seccion"]

    def test_aviso_agrupado_corta_en_diez(self):
        guardados = [EnSeccion(str(i), f"E{i}") for i in range(1, 13)]
        _, omitidos, avisos = separar_repetidos(_filas(*[(f"E{i}", str(i)) for i in range(1, 13)]), guardados)
        assert len(omitidos) == 12
        assert avisos == [
            "Se omiten 12 estudiantes cuyo código ya está en la sección: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 y 2 más"
        ]

    def test_mismo_nombre_con_otro_codigo_se_importa_y_avisa(self):
        a_importar, omitidos, avisos = separar_repetidos(
            _filas(("Ana Ruíz", "2"), ("BETO", "3"), ("BETO", "4")), [EnSeccion("1", "ANA RUIZ")],
        )
        assert [c for _, c, _ in a_importar] == ["2", "3", "4"]
        assert omitidos == []
        assert avisos == [
            "Fila 2: 'Ana Ruíz' ya está en la sección con el código '1'; se importa igual con el código '2'",
            "Fila 4: 'BETO' también está en la fila 3 con otro código ('3'); se importan los dos",
        ]


class TestLeerConFilas:
    def test_numera_como_el_archivo_saltando_las_invalidas(self):
        validos, _ = leer_lista_con_filas(b"Nombre,Codigo\nAna,1\n,2\nBeto,3\n", "l.csv", "text/csv")
        assert validos == [(2, ("ANA", "1", None)), (4, ("BETO", "3", None))]


class TestCodigosNumericosDeExcel:
    """Cómo llegan los códigos de un .xlsx real (openpyxl) y cómo se comparan."""

    def _libro(self):
        from openpyxl import Workbook
        wb = Workbook()
        ws = wb.active
        ws.append(["Nombre", "Codigo"])
        ws.append(["Ana", 123.0])       # número entero guardado como float
        ws.append(["Beto", "00123"])    # texto con ceros a la izquierda
        ws.append(["Carla", 123])
        ws["B4"].number_format = "00000"  # se ve 00123, pero el valor es 123
        ws.append(["Dora", 123.5])      # no entero: se conserva el decimal
        salida = io.BytesIO()
        wb.save(salida)
        return salida.getvalue()

    def test_valores_leidos(self):
        validos, _ = leer_lista(self._libro(), "l.xlsx", None)
        assert [c for _, c, _ in validos] == ["123", "00123", "123", "123.5"]

    def test_los_tres_primeros_son_el_mismo_codigo(self):
        validos, _ = leer_lista_con_filas(self._libro(), "l.xlsx", None)
        a_importar, omitidos, _ = separar_repetidos(validos, [])
        assert [n for n, _, _ in a_importar] == ["ANA", "DORA"]
        assert [(o.fila, o.motivo, o.fila_conservada) for o in omitidos] == [
            (3, "en_archivo", 2), (4, "en_archivo", 2),
        ]
