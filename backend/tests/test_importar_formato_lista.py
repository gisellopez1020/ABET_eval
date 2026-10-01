"""
Importación de estudiantes con el formato de la lista institucional (el mismo que
exporta la app): Nombre | Apellido(s) | Número de ID | Dirección de correo | Grupo.

Nombre y Apellido(s) se unen en nombre_completo; Grupo no se guarda y solo genera un
aviso no bloqueante si no coincide con la sección. El formato de siempre (Nombre,Codigo)
sigue igual. Reutiliza las fixtures de SQLite y los helpers de test_exportar_estudiantes.
"""
import pytest

from app.models import Estudiante
from app.services.lista_estudiantes import _columnas
from tests.test_catalogo_ra_abet import MOCK_USER, client, db_session  # noqa: F401 (fixtures)
from tests.test_exportar_estudiantes import MIME_XLSX, _curso, _est, _xlsx

ENCABEZADO = ("Nombre", "Apellido(s)", "Número de ID", "Dirección de correo", "Grupo")
FILAS = [
    ("Valentina", "Rojas Medina", "2021001", "valentina@uao.edu.co", "S1"),
    ("Juan Esteban", "Ospina Cárdenas", "2021002", "", "S1"),
]
ESPERADO = [
    ("JUAN ESTEBAN OSPINA CÁRDENAS", "2021002", None),
    ("VALENTINA ROJAS MEDINA", "2021001", "valentina@uao.edu.co"),
]


def _csv(*filas):
    return "\n".join(",".join(str(c) for c in fila) for fila in filas).encode() + b"\n"


def _subir(client, seccion, contenido, excel=False, ruta="csv"):
    archivo = ("e.xlsx", contenido, MIME_XLSX) if excel else ("e.csv", contenido, "text/csv")
    return client.post(f"/secciones/{seccion.id}/estudiantes/{ruta}", files={"archivo": archivo})


def _guardados(db_session, seccion):
    db_session.expire_all()
    return sorted(
        (e.nombre_completo, e.codigo_estudiante, e.email)
        for e in db_session.query(Estudiante).filter_by(seccion_id=seccion.id).all()
    )


class TestFormatoLista:
    @pytest.mark.parametrize("excel", [False, True], ids=["csv", "excel"])
    def test_nombre_y_apellidos_separados_igual_que_una_sola_columna(self, client, db_session, excel):
        _, [separado, junto] = _curso(db_session, secciones=("S1", "S2"))
        filas_separado = [ENCABEZADO, *FILAS]
        filas_junto = [
            ("Nombre", "Codigo", "Email"),
            ("Valentina Rojas Medina", "2021001", "valentina@uao.edu.co"),
            ("Juan Esteban Ospina Cárdenas", "2021002", ""),
        ]
        armar = _xlsx if excel else (lambda filas: _csv(*filas))

        r1 = _subir(client, separado, armar(filas_separado), excel)
        r2 = _subir(client, junto, armar(filas_junto), excel)
        assert r1.status_code == r2.status_code == 201
        assert r1.json() == r2.json() == {"importados": 2, "errores": []}
        assert _guardados(db_session, separado) == _guardados(db_session, junto) == ESPERADO

    @pytest.mark.parametrize("encabezado", [
        ("Nombre", "Apellido(s)", "Número de ID", "Dirección de correo", "Grupo"),
        ("Nombre", "Apellidos", "Numero de ID", "Direccion de correo", "Grupo"),
        ("NOMBRE", "APELLIDO(S)", "NÚMERO DE ID", "DIRECCIÓN DE CORREO", "GRUPO"),
        ("Nombre", "Apellido", " Número  de  ID ", "Correo", "Grupo"),
        ("Nombre", "Apellido(s)", "ID", "Email", "Grupo"),
    ])
    def test_alias_de_columnas(self, client, db_session, encabezado):
        _, [s1] = _curso(db_session)
        resp = _subir(client, s1, _csv(encabezado, *FILAS))
        assert resp.json() == {"importados": 2, "errores": []}
        assert _guardados(db_session, s1) == ESPERADO

    def test_apellidos_no_se_confunde_con_la_columna_de_id(self):
        """'Apellido(s)' contiene 'id': el código se busca por encabezado entero, no por fragmento."""
        cols = _columnas(["Nombre", "Apellido(s)", "Número de ID"])
        assert (cols.codigo, cols.apellidos) == ("Número de ID", "Apellido(s)")
        assert _columnas(["Nombre", "Apellido(s)"]).codigo is None

    def test_codigo_tiene_prioridad_sobre_numero_de_id(self):
        assert _columnas(["Nombre", "Número de ID", "Código"]).codigo == "Código"

    def test_apellidos_vacio_deja_solo_el_nombre(self, client, db_session):
        _, [s1] = _curso(db_session)
        resp = _subir(client, s1, _csv(ENCABEZADO, ("Cher", "", "1", "", "S1"), ("  Ana  ", "  Ruiz ", "2", "", "S1")))
        assert resp.json()["importados"] == 2
        assert [n for n, _, _ in _guardados(db_session, s1)] == ["ANA RUIZ", "CHER"]

    def test_fila_sin_nombre_ni_apellidos_se_omite(self, client, db_session):
        _, [s1] = _curso(db_session)
        resp = _subir(client, s1, _csv(ENCABEZADO, ("", "", "1", "", "S1"), ("Ana", "Ruiz", "2", "", "S1")))
        assert resp.json() == {"importados": 1, "errores": ["Fila 2: nombre o código vacío, se omite"]}

    def test_sin_columna_de_codigo_ni_id_422(self, client, db_session):
        _, [s1] = _curso(db_session)
        resp = _subir(client, s1, _csv(("Nombre", "Apellido(s)", "Grupo"), ("Ana", "Ruiz", "S1")))
        assert resp.status_code == 422
        assert "Número de ID" in resp.json()["detail"]
        assert _guardados(db_session, s1) == []

    def test_lo_que_exporta_la_app_se_puede_volver_a_importar(self, client, db_session):
        _, [origen, destino] = _curso(db_session, secciones=("S1", "S1 copia"))
        _est(db_session, origen, "VALENTINA ROJAS MEDINA", "2021001", "valentina@uao.edu.co")
        _est(db_session, origen, "JUAN ESTEBAN OSPINA CÁRDENAS", "2021002")
        _est(db_session, origen, "MARÍA JOSÉ DE LA CRUZ PÉREZ", "0012")
        exportado = client.get("/estudiantes/exportar-excel", params={"seccion_id": origen.id}).content

        resp = _subir(client, destino, exportado, excel=True)
        assert resp.json()["importados"] == 3
        assert _guardados(db_session, destino) == _guardados(db_session, origen)


class TestFormatoDeSiempre:
    def test_nombre_y_codigo_siguen_igual(self, client, db_session):
        _, [s1] = _curso(db_session)
        resp = _subir(client, s1, b"Nombre,Codigo\nOscar Evelio Prada Ceballos,2021001\nAna Ruiz,2021002\n")
        assert resp.status_code == 201
        assert resp.json() == {"importados": 2, "errores": []}
        assert _guardados(db_session, s1) == [
            ("ANA RUIZ", "2021002", None), ("OSCAR EVELIO PRADA CEBALLOS", "2021001", None),
        ]

    def test_columnas_del_formato_de_siempre(self):
        assert _columnas(["Nombre", "Codigo"]) == ("Nombre", "Codigo", None, None, None)
        assert _columnas(["Nombre", "Código", "Email"]) == ("Nombre", "Código", "Email", None, None)


class TestVistaPrevia:
    @pytest.mark.parametrize("excel", [False, True], ids=["csv", "excel"])
    def test_muestra_el_nombre_ya_combinado_y_no_guarda(self, client, db_session, excel):
        _, [s1] = _curso(db_session)
        contenido = _xlsx([ENCABEZADO, *FILAS]) if excel else _csv(ENCABEZADO, *FILAS)
        resp = _subir(client, s1, contenido, excel, ruta="vista-previa")
        assert resp.status_code == 200
        assert resp.json() == {
            "estudiantes": [
                {"nombre": "VALENTINA ROJAS MEDINA", "codigo": "2021001", "email": "valentina@uao.edu.co"},
                {"nombre": "JUAN ESTEBAN OSPINA CÁRDENAS", "codigo": "2021002", "email": None},
            ],
            "errores": [],
        }
        assert _guardados(db_session, s1) == []

    def test_csv_con_comas_entre_comillas(self, client, db_session):
        """La vista previa del CSV ahora la calcula el backend: respeta las comillas del CSV."""
        _, [s1] = _curso(db_session)
        resp = _subir(client, s1, 'Nombre,Codigo\n"Ruiz, Ana",1\n'.encode(), ruta="vista-previa")
        assert resp.json()["estudiantes"] == [{"nombre": "RUIZ, ANA", "codigo": "1", "email": None}]


class TestAvisoDeGrupo:
    def test_grupo_distinto_avisa_una_vez_por_valor_y_no_bloquea(self, client, db_session):
        _, [s1] = _curso(db_session)
        contenido = _csv(
            ENCABEZADO,
            ("Ana", "Ruiz", "1", "", "S1"),
            ("Beto", "Diaz", "2", "", "G02"),
            ("Caro", "Mesa", "3", "", "G02"),
            ("Dani", "Vega", "4", "", "G03"),
        )
        resp = _subir(client, s1, contenido)
        assert resp.status_code == 201
        assert resp.json() == {
            "importados": 4,
            "errores": [
                "2 filas tienen Grupo 'G02', distinto de esta sección ('S1'); se importan igual",
                "1 fila tiene Grupo 'G03', distinto de esta sección ('S1'); se importa igual",
            ],
        }
        assert len(_guardados(db_session, s1)) == 4

    def test_grupo_igual_sin_aviso_aunque_cambien_mayusculas_o_espacios(self, client, db_session):
        _, [s1] = _curso(db_session, secciones=("Grupo 01",))
        contenido = _csv(ENCABEZADO, ("Ana", "Ruiz", "1", "", " grupo  01 "), ("Beto", "Diaz", "2", "", "GRUPO 01"))
        assert _subir(client, s1, contenido).json() == {"importados": 2, "errores": []}

    def test_grupo_vacio_o_sin_columna_sin_aviso(self, client, db_session):
        _, [s1, s2] = _curso(db_session, secciones=("S1", "S2"))
        assert _subir(client, s1, _csv(ENCABEZADO, ("Ana", "Ruiz", "1", "", ""))).json()["errores"] == []
        sin_grupo = _csv(("Nombre", "Apellido(s)", "Número de ID"), ("Ana", "Ruiz", "1"))
        assert _subir(client, s2, sin_grupo).json()["errores"] == []

    def test_la_vista_previa_avisa_antes_de_importar(self, client, db_session):
        _, [s1] = _curso(db_session)
        contenido = _xlsx([ENCABEZADO, ("Ana", "Ruiz", "1", "", "G02")])
        resp = _subir(client, s1, contenido, excel=True, ruta="vista-previa")
        assert resp.json()["errores"] == ["1 fila tiene Grupo 'G02', distinto de esta sección ('S1'); se importa igual"]
        assert _guardados(db_session, s1) == []

    def test_fila_omitida_no_cuenta_para_el_aviso(self, client, db_session):
        _, [s1] = _curso(db_session)
        resp = _subir(client, s1, _csv(ENCABEZADO, ("", "", "1", "", "G02")))
        assert resp.json() == {"importados": 0, "errores": ["Fila 2: nombre o código vacío, se omite"]}
