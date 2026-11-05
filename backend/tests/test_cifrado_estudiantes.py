"""
RNF-14: cifrado en reposo del nombre, el código y el correo del estudiante.

- DATA_ENCRYPTION_KEY: obligatoria con SKIP_AUTH=false, válida si se configura,
  distinta de las otras claves.
- Ida y vuelta, prefijo enc:v1:, subclave derivada con HKDF, clave equivocada.
- En la base (SQL directo) no queda ningún nombre, código ni correo legible; el resto de
  la app (servicios, API, exportaciones, reportes) sigue viendo los datos originales.
- Clave equivocada en ejecución: 503 con mensaje claro, sin texto cifrado en la respuesta.
- Cifrado en bloque (migración 0012 y arranque), idempotente y reversible.
- Orden alfabético español en Python.
- Nada de esto escribe datos del estudiante ni claves en los logs.
"""
import io
import logging
from pathlib import Path

import pytest
from cryptography.fernet import Fernet, InvalidToken
from openpyxl import load_workbook
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import StatementError

from app.config import Settings, settings
from app.models import Estudiante
from app.repositories.estudiante import EstudianteRepository
from app.services import cifrado_estudiantes
from app.services.estudiantes import EstudianteService
from app.services.reportes import ReporteService
from app.utils import cifrado
from app.utils.cifrado import DatosIlegibles, cifrar_dato, descifrar_dato, esta_cifrado
from app.utils.orden import clave_nombre, ordenar_por_nombre
from app import verificar_cifrado
from tests.test_catalogo_ra_abet import MOCK_USER, client, db_session  # noqa: F401 (fixtures)
from tests.test_exportar_estudiantes import _curso, _est
from tests.test_reporte_service import ctx, drive  # noqa: F401 (fixtures)

EMAIL = MOCK_USER["email"]
RAIZ = Path(__file__).resolve().parents[2]
NOMBRE, CODIGO, CORREO = "MUÑOZ PÉREZ JOSÉ ÁNGEL", "2210456", "jose.munoz@uao.edu.co"


def nueva_clave() -> str:
    return Fernet.generate_key().decode()


@pytest.fixture(autouse=True)
def clave(monkeypatch):
    """Cada prueba con su propia DATA_ENCRYPTION_KEY (la suite general corre sin clave)."""
    valor = nueva_clave()
    monkeypatch.setattr(settings, "data_encryption_key", valor)
    return valor


def _crudo(db_session, estudiante_id):
    """Los valores tal como están en la base, sin pasar por el ORM."""
    return db_session.execute(
        text("SELECT nombre_completo, codigo_estudiante, email FROM estudiantes WHERE id = :id"),
        {"id": estudiante_id},
    ).one()


# ── Validación de DATA_ENCRYPTION_KEY en Settings ────────────────────────────

class TestValidador:
    @pytest.fixture(autouse=True)
    def entorno_limpio(self, monkeypatch):
        for variable in ("SKIP_AUTH", "JWT_SECRET_KEY", "TOKEN_ENCRYPTION_KEY", "DATA_ENCRYPTION_KEY"):
            monkeypatch.delenv(variable, raising=False)

    @staticmethod
    def produccion(**kwargs) -> Settings:
        kwargs.setdefault("jwt_secret_key", "j" * 32)
        kwargs.setdefault("token_encryption_key", nueva_clave())
        return Settings(_env_file=None, skip_auth=False, **kwargs)

    def test_clave_valida_arranca(self):
        k = nueva_clave()
        assert self.produccion(data_encryption_key=k).data_encryption_key == k

    @pytest.mark.parametrize("valor", [
        "PLACEHOLDER", "", "   ", "corta",
        nueva_clave()[:-2],                       # 32 bytes truncados
        nueva_clave().replace("=", "") + "AAAA",  # 33 bytes
        "*" + nueva_clave()[1:],                  # carácter fuera de base64 (no se descarta)
    ])
    def test_falta_vacia_marcador_o_invalida_no_arranca(self, valor):
        with pytest.raises(ValidationError) as exc:
            self.produccion(data_encryption_key=valor)
        mensaje = str(exc.value)
        assert "DATA_ENCRYPTION_KEY no es una clave válida" in mensaje
        assert "no se pueden" in mensaje and "recuperar" in mensaje
        assert "Fernet.generate_key()" in mensaje

    def test_sin_definir_no_arranca(self):
        with pytest.raises(ValidationError) as exc:
            Settings(_env_file=None, skip_auth=False, jwt_secret_key="j" * 32, token_encryption_key=nueva_clave())
        assert "DATA_ENCRYPTION_KEY" in str(exc.value)

    def test_igual_a_token_encryption_key_no_arranca(self):
        k = nueva_clave()
        with pytest.raises(ValidationError) as exc:
            self.produccion(token_encryption_key=k, data_encryption_key=k)
        assert "distinta de TOKEN_ENCRYPTION_KEY y de JWT_SECRET_KEY" in str(exc.value)

    def test_igual_a_jwt_secret_key_no_arranca(self):
        k = nueva_clave()
        with pytest.raises(ValidationError) as exc:
            self.produccion(jwt_secret_key=k, data_encryption_key=k)
        assert "distinta de TOKEN_ENCRYPTION_KEY y de JWT_SECRET_KEY" in str(exc.value)

    def test_el_mensaje_no_incluye_la_clave(self):
        k = nueva_clave()
        with pytest.raises(ValidationError) as exc:
            self.produccion(token_encryption_key=k, data_encryption_key=k)
        assert k not in str(exc.value)

    def test_un_jwt_inseguro_se_reporta_antes(self):
        with pytest.raises(ValidationError) as exc:
            Settings(_env_file=None, skip_auth=False, jwt_secret_key="PLACEHOLDER")
        assert "JWT_SECRET_KEY" in str(exc.value)
        assert "DATA_ENCRYPTION_KEY" not in str(exc.value)

    @pytest.mark.parametrize("valor", ["PLACEHOLDER", ""])
    def test_modo_demo_sin_clave_arranca(self, valor):
        assert Settings(_env_file=None, skip_auth=True, data_encryption_key=valor).skip_auth

    def test_modo_demo_con_clave_mal_escrita_no_arranca(self):
        """Un error de tipeo no debe hacer que se guarde en claro sin aviso."""
        with pytest.raises(ValidationError) as exc:
            Settings(_env_file=None, skip_auth=True, data_encryption_key="corta")
        assert "DATA_ENCRYPTION_KEY" in str(exc.value)

    def test_variable_de_entorno(self, monkeypatch):
        monkeypatch.setenv("SKIP_AUTH", "false")
        monkeypatch.setenv("JWT_SECRET_KEY", "j" * 32)
        monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", nueva_clave())
        monkeypatch.setenv("DATA_ENCRYPTION_KEY", nueva_clave())
        assert Settings(_env_file=None).skip_auth is False

    def test_env_example_trae_el_marcador_invalido(self):
        lineas = (RAIZ / ".env.example").read_text(encoding="utf-8").splitlines()
        assert "DATA_ENCRYPTION_KEY=PLACEHOLDER" in lineas
        with pytest.raises(ValidationError):
            self.produccion(data_encryption_key="PLACEHOLDER")

    def test_los_compose_pasan_la_clave_y_verifican_al_arrancar(self):
        for nombre in ("docker-compose.yml", "docker-compose.prod.yml"):
            contenido = (RAIZ / nombre).read_text(encoding="utf-8")
            assert "DATA_ENCRYPTION_KEY: ${DATA_ENCRYPTION_KEY:-PLACEHOLDER}" in contenido
        for nombre in ("docker-compose.yml", "docker-compose.prod.yml", "docker-compose.https.yml",
                       "docker-compose.detras-de-proxy.yml"):
            contenido = (RAIZ / nombre).read_text(encoding="utf-8")
            assert "alembic upgrade head && python -m app.verificar_cifrado && exec uvicorn" in contenido


# ── utils/cifrado.py ─────────────────────────────────────────────────────────

class TestCifrarDato:
    @pytest.mark.parametrize("valor", [NOMBRE, CODIGO, CORREO, "ÑANDÚ Ü 😀", "x" * 254, ""])
    def test_ida_y_vuelta(self, valor):
        guardado = cifrar_dato(valor)
        assert guardado.startswith("enc:v1:")
        assert descifrar_dato(guardado) == valor

    def test_no_contiene_el_original_y_cambia_cada_vez(self):
        a, b = cifrar_dato(NOMBRE), cifrar_dato(NOMBRE)
        assert a != b  # vector aleatorio: el mismo nombre no se puede reconocer en la base
        for guardado in (a, b):
            assert NOMBRE not in guardado and "MUÑOZ" not in guardado and "MU" not in guardado[7:9]

    def test_usa_una_subclave_derivada_no_la_clave_maestra(self, clave):
        token = cifrar_dato(NOMBRE)[len("enc:v1:"):]
        with pytest.raises(InvalidToken):
            Fernet(clave.encode()).decrypt(token.encode())

    def test_clave_equivocada_lanza_datos_ilegibles(self, monkeypatch):
        guardado = cifrar_dato(NOMBRE)
        monkeypatch.setattr(settings, "data_encryption_key", nueva_clave())
        with pytest.raises(DatosIlegibles) as exc:
            descifrar_dato(guardado)
        assert "no es la clave con que se cifraron" in str(exc.value)
        assert "no se" in str(exc.value) and "recuperar" in str(exc.value)

    def test_cifrado_sin_clave_lanza_datos_ilegibles(self, monkeypatch):
        guardado = cifrar_dato(NOMBRE)
        monkeypatch.setattr(settings, "data_encryption_key", "PLACEHOLDER")
        with pytest.raises(DatosIlegibles) as exc:
            descifrar_dato(guardado)
        assert "no está configurada" in str(exc.value)

    def test_valor_alterado_lanza_datos_ilegibles(self):
        guardado = cifrar_dato(NOMBRE)
        with pytest.raises(DatosIlegibles):
            descifrar_dato(guardado[:-6] + "AAAAAA")

    def test_texto_plano_anterior_se_lee_igual(self):
        assert descifrar_dato(NOMBRE) == NOMBRE
        assert not esta_cifrado(NOMBRE)

    def test_sin_clave_no_cifra(self, monkeypatch):
        monkeypatch.setattr(settings, "data_encryption_key", "PLACEHOLDER")
        assert cifrar_dato(NOMBRE) == NOMBRE

    def test_tokens_de_drive_siguen_con_su_propia_clave(self, monkeypatch):
        monkeypatch.setattr(settings, "token_encryption_key", nueva_clave())
        assert cifrado.descifrar(cifrado.cifrar("refresh")) == "refresh"


# ── En la base solo hay texto cifrado; la app ve los datos originales ────────

class TestEnLaBase:
    def test_alta_guarda_cifrado_y_se_lee_en_claro(self, db_session):
        _, [s1] = _curso(db_session)
        creado = EstudianteService(db_session).agregar(s1.id, EMAIL, NOMBRE, CODIGO, CORREO).estudiante
        crudo = _crudo(db_session, creado.id)
        assert all(v.startswith("enc:v1:") for v in crudo)
        assert not any(dato in v for v in crudo for dato in (NOMBRE, CODIGO, CORREO, "MUÑOZ", "2210456", "uao.edu.co"))
        db_session.expire_all()
        leido = db_session.get(Estudiante, creado.id)
        assert (leido.nombre_completo, leido.codigo_estudiante, leido.email) == (NOMBRE, CODIGO, CORREO)

    def test_correo_vacio_queda_nulo(self, db_session):
        _, [s1] = _curso(db_session)
        est = _est(db_session, s1, NOMBRE, CODIGO)
        assert _crudo(db_session, est.id)[2] is None

    def test_edicion_vuelve_a_cifrar(self, db_session):
        _, [s1] = _curso(db_session)
        est = _est(db_session, s1, NOMBRE, CODIGO, CORREO)
        EstudianteService(db_session).editar(est.id, EMAIL, {"nombre_completo": "Peña Ana", "codigo_estudiante": "99"})
        crudo = _crudo(db_session, est.id)
        assert crudo[0].startswith("enc:v1:") and "PEÑA" not in crudo[0]
        db_session.expire_all()
        assert db_session.get(Estudiante, est.id).nombre_completo == "PEÑA ANA"

    def test_columnas_sueltas_tambien_se_descifran(self, db_session):
        _, [s1] = _curso(db_session)
        est = _est(db_session, s1, NOMBRE, CODIGO)
        assert EstudianteRepository(db_session).nombres_por_id([est.id]) == {est.id: NOMBRE}

    def test_conserva_el_limite_de_longitud_anterior(self, db_session):
        _, [s1] = _curso(db_session)
        with pytest.raises(StatementError) as exc:
            _est(db_session, s1, "A" * 201, "1")
        assert str(exc.value.orig) == "El texto supera los 200 caracteres permitidos"
        db_session.rollback()

    def test_los_errores_de_sql_de_la_app_no_muestran_los_valores(self):
        """Sin hide_parameters, el error anterior traería el nombre en '[parameters: ...]'."""
        from app.database import engine
        assert engine.hide_parameters is True

    def test_importacion_csv_cifra_todo_y_los_repetidos_se_importan_como_antes(self, client, db_session):
        """Sin detección de duplicados (decisión del equipo): importar repetidos sigue igual que antes."""
        _, [s1] = _curso(db_session)
        csv = f"Nombre,Codigo,Email\n{NOMBRE},{CODIGO},{CORREO}\n{NOMBRE},{CODIGO},{CORREO}\nPEÑA ANA,1,\n"
        resp = client.post(
            f"/secciones/{s1.id}/estudiantes/csv",
            files={"archivo": ("lista.csv", csv.encode("utf-8"), "text/csv")},
        )
        assert resp.status_code in (200, 201), resp.text
        assert resp.json()["importados"] == 3
        filas = db_session.execute(text("SELECT nombre_completo, codigo_estudiante FROM estudiantes")).all()
        assert len(filas) == 3
        assert all(v.startswith("enc:v1:") for fila in filas for v in fila)
        nombres = [e["nombre_completo"] for e in client.get(f"/secciones/{s1.id}/estudiantes").json()]
        assert nombres == [NOMBRE, NOMBRE, "PEÑA ANA"]


# ── Clave equivocada en ejecución: 503 controlado ────────────────────────────

class TestClaveEquivocadaEnEjecucion:
    def test_listar_responde_503_con_mensaje_claro(self, client, db_session, monkeypatch):
        _, [s1] = _curso(db_session)
        _est(db_session, s1, NOMBRE, CODIGO, CORREO)
        guardado = _crudo(db_session, 1)[0]
        db_session.expire_all()
        monkeypatch.setattr(settings, "data_encryption_key", nueva_clave())
        resp = client.get(f"/secciones/{s1.id}/estudiantes")
        assert resp.status_code == 503
        detalle = resp.json()["detail"]
        assert "DATA_ENCRYPTION_KEY no es la clave con que se cifraron" in detalle
        assert "enc:v1:" not in resp.text and guardado[7:30] not in resp.text

    def test_exportar_excel_tambien_503(self, client, db_session, monkeypatch):
        _, [s1] = _curso(db_session)
        _est(db_session, s1, NOMBRE, CODIGO)
        db_session.expire_all()
        monkeypatch.setattr(settings, "data_encryption_key", nueva_clave())
        assert client.get("/estudiantes/exportar-excel").status_code == 503


# ── Exportaciones y reportes siguen mostrando los datos correctos ────────────

class TestExportacionesYReportes:
    def test_excel_de_estudiantes(self, client, db_session):
        _, [s1] = _curso(db_session)
        _est(db_session, s1, NOMBRE, CODIGO, CORREO)
        resp = client.get("/estudiantes/exportar-excel")
        assert resp.status_code == 200
        filas = list(load_workbook(io.BytesIO(resp.content)).active.iter_rows(values_only=True))
        # Nombre y apellidos se separan como siempre (exportar_estudiantes.separar_nombre)
        assert " ".join(filas[1][:2]) == NOMBRE
        assert filas[1][2:4] == (CODIGO, CORREO)

    def test_excel_de_detalle_con_nombres_y_codigos(self, db_session, ctx, drive):
        crudo = _crudo(db_session, 1)
        assert crudo[0].startswith("enc:v1:")
        contenido, _, _ = ReporteService(db_session).detalle_xlsx(ctx["curso"].id, ctx["act"].id, EMAIL, None)
        libro = load_workbook(io.BytesIO(contenido))
        textos = {str(c) for ws in libro.worksheets for fila in ws.iter_rows(values_only=True) for c in fila if c}
        assert any("Ana (1)" in t for t in textos)
        assert not any("enc:v1:" in t for t in textos)

    def test_reporte_abet_cuenta_igual(self, db_session, ctx):
        reporte = ReporteService(db_session).reporte_curso(ctx["curso"].id, EMAIL, None)
        assert "enc:v1:" not in reporte.model_dump_json()

    def test_calificacion_por_seccion_muestra_nombres(self, client, db_session, ctx):
        resp = client.get(f"/actividades/{ctx['act'].id}/calificaciones/{ctx['s1'].id}")
        assert resp.status_code == 200, resp.text
        assert "Ana" in resp.text and "enc:v1:" not in resp.text


# ── Cifrado en bloque: migración 0012 y arranque ─────────────────────────────

def _insertar_en_claro(db_session, seccion_id, filas):
    for nombre, codigo, email in filas:
        db_session.execute(
            text("INSERT INTO estudiantes (nombre_completo, codigo_estudiante, email, seccion_id) "
                 "VALUES (:n, :c, :e, :s)"),
            {"n": nombre, "c": codigo, "e": email, "s": seccion_id},
        )
    db_session.commit()


class TestCifradoEnBloque:
    @pytest.fixture()
    def seccion(self, db_session):
        return _curso(db_session)[1][0]

    def test_cifra_lo_existente_es_idempotente_y_reversible(self, db_session, seccion):
        originales = [(NOMBRE, CODIGO, CORREO), ("PEÑA ANA", "1", None), ("ZAPATA LUIS", "2", "z@uao.edu.co")]
        _insertar_en_claro(db_session, seccion.id, originales)
        conexion = db_session.connection()
        assert cifrado_estudiantes.estado(conexion).valores_en_claro == 8
        assert cifrado_estudiantes.cifrar_pendientes(conexion) == 3
        estado = cifrado_estudiantes.estado(conexion)
        assert (estado.valores_cifrados, estado.valores_en_claro) == (8, 0)
        antes = db_session.execute(text("SELECT * FROM estudiantes ORDER BY id")).all()
        assert cifrado_estudiantes.cifrar_pendientes(conexion) == 0  # no recifra
        assert db_session.execute(text("SELECT * FROM estudiantes ORDER BY id")).all() == antes
        assert cifrado_estudiantes.descifrar_todos(conexion) == 3
        assert db_session.execute(
            text("SELECT nombre_completo, codigo_estudiante, email FROM estudiantes ORDER BY id")
        ).all() == originales

    def test_mezcla_de_cifrados_y_en_claro(self, db_session, seccion):
        _est(db_session, seccion, "ORM CIFRADO", "10")
        _insertar_en_claro(db_session, seccion.id, [("EN CLARO", "11", None)])
        assert cifrado_estudiantes.cifrar_pendientes(db_session.connection()) == 1
        db_session.expire_all()
        assert sorted(e.nombre_completo for e in db_session.query(Estudiante)) == ["EN CLARO", "ORM CIFRADO"]

    def test_no_cifra_con_otra_clave_encima(self, db_session, seccion, monkeypatch):
        """Si hay datos de otra clave, no se mezclan valores de dos claves."""
        _est(db_session, seccion, NOMBRE, CODIGO)
        _insertar_en_claro(db_session, seccion.id, [("EN CLARO", "11", None)])
        monkeypatch.setattr(settings, "data_encryption_key", nueva_clave())
        with pytest.raises(DatosIlegibles):
            cifrado_estudiantes.cifrar_pendientes(db_session.connection())

    def test_descifrar_exige_la_misma_clave(self, db_session, seccion, monkeypatch):
        _est(db_session, seccion, NOMBRE, CODIGO)
        monkeypatch.setattr(settings, "data_encryption_key", nueva_clave())
        with pytest.raises(DatosIlegibles):
            cifrado_estudiantes.descifrar_todos(db_session.connection())


class TestVerificarAlArrancar:
    @pytest.fixture()
    def seccion(self, db_session):
        return _curso(db_session)[1][0]

    def test_clave_equivocada_no_arranca_con_mensaje_claro(self, db_session, seccion, monkeypatch, capsys):
        _est(db_session, seccion, NOMBRE, CODIGO)
        monkeypatch.setattr(settings, "data_encryption_key", nueva_clave())
        assert verificar_cifrado.ejecutar(db_session.connection()) == 1
        salida = capsys.readouterr()
        assert "no es la clave con que se cifraron" in salida.err and "no arranca" in salida.err
        assert NOMBRE not in salida.out + salida.err

    def test_datos_cifrados_y_sin_clave_no_arranca(self, db_session, seccion, monkeypatch, capsys):
        _est(db_session, seccion, NOMBRE, CODIGO)
        monkeypatch.setattr(settings, "data_encryption_key", "PLACEHOLDER")
        assert verificar_cifrado.ejecutar(db_session.connection()) == 1
        assert "no está configurada" in capsys.readouterr().err

    def test_con_clave_cifra_lo_pendiente(self, db_session, seccion, capsys):
        _insertar_en_claro(db_session, seccion.id, [(NOMBRE, CODIGO, CORREO)])
        assert verificar_cifrado.ejecutar(db_session.connection()) == 0
        salida = capsys.readouterr().out
        assert "se cifraron 1 estudiantes" in salida and "0 valores en claro" in salida
        assert NOMBRE not in salida and CODIGO not in salida
        assert _crudo(db_session, 1)[0].startswith("enc:v1:")

    def test_sin_clave_en_modo_demo_avisa_y_arranca(self, db_session, seccion, monkeypatch, capsys):
        _insertar_en_claro(db_session, seccion.id, [(NOMBRE, CODIGO, None)])
        monkeypatch.setattr(settings, "data_encryption_key", "PLACEHOLDER")
        assert verificar_cifrado.ejecutar(db_session.connection()) == 0
        assert "SIN CIFRAR" in capsys.readouterr().err


# ── Orden alfabético español ─────────────────────────────────────────────────

ORDEN_ESPERADO = [
    "ÁLVAREZ ANA", "ALVAREZ BETO", "DE LA CRUZ FE", "DELGADO GIL", "güiza hugo", "MUNOZ IVÁN",
    "MUÑOZ HUGO", "NUNZZ XIMENA", "NUÑEZ DORA", "NÚÑEZ ELSA", "ÑUÑEZ CARLA", "OSORIO EVA",
    "PENA", "PENZ", "PEÑA", "PEO", "ZAPATA LUIS",
]


class TestOrdenEspanol:
    def test_tildes_mayusculas_y_enie(self):
        desordenados = list(reversed(ORDEN_ESPERADO))
        assert sorted(desordenados, key=lambda n: (clave_nombre(n), n)) == ORDEN_ESPERADO

    def test_cambio_visible_respecto_de_postgres(self):
        """Antes (PostgreSQL alpine, orden por código de carácter) Á y Ñ iban después de la Z."""
        assert sorted(["ZAPATA", "ÁLVAREZ", "ÑUÑEZ", "OSORIO"]) == ["OSORIO", "ZAPATA", "ÁLVAREZ", "ÑUÑEZ"]
        assert sorted(["ZAPATA", "ÁLVAREZ", "ÑUÑEZ", "OSORIO"], key=clave_nombre) == ["ÁLVAREZ", "ÑUÑEZ", "OSORIO", "ZAPATA"]

    def test_desempate_por_id(self):
        class E:
            def __init__(self, id, nombre):
                self.id, self.nombre_completo = id, nombre
        iguales = [E(3, "ANA"), E(1, "ANA"), E(2, "ANA")]
        assert [e.id for e in ordenar_por_nombre(iguales)] == [1, 2, 3]

    def test_repositorio_ordena_la_seccion(self, db_session):
        _, [s1] = _curso(db_session)
        for i, nombre in enumerate(reversed(ORDEN_ESPERADO)):
            _est(db_session, s1, nombre, str(i))
        nombres = [e.nombre_completo for e in EstudianteRepository(db_session).de_seccion(s1.id)]
        assert nombres == ORDEN_ESPERADO

    def test_exportar_ordena_por_asignatura_seccion_y_nombre(self, db_session):
        _, [s1, s2] = _curso(db_session, secciones=("A", "B"))
        _est(db_session, s2, "ÁLVAREZ ANA", "1")
        _est(db_session, s1, "ZAPATA LUIS", "2")
        _est(db_session, s1, "ÑUÑEZ CARLA", "3")
        _est(db_session, s2, "OSORIO EVA", "4")
        filas = EstudianteRepository(db_session).para_exportar(EMAIL)
        assert [(sec.nombre, est.nombre_completo) for est, sec, _ in filas] == [
            ("A", "ÑUÑEZ CARLA"), ("A", "ZAPATA LUIS"), ("B", "ÁLVAREZ ANA"), ("B", "OSORIO EVA"),
        ]


# ── Logs ─────────────────────────────────────────────────────────────────────

def test_ningun_log_contiene_datos_del_estudiante_ni_la_clave(client, db_session, clave, caplog, ctx, drive):
    caplog.set_level(logging.DEBUG)
    s1 = ctx["s1"]
    EstudianteService(db_session).agregar(s1.id, EMAIL, NOMBRE, CODIGO, CORREO)
    client.post(
        f"/secciones/{s1.id}/estudiantes/csv",
        files={"archivo": ("l.csv", f"Nombre,Codigo\n{NOMBRE},{CODIGO}\n".encode(), "text/csv")},
    )
    client.get(f"/secciones/{s1.id}/estudiantes")
    client.get("/estudiantes/exportar-excel")
    ReporteService(db_session).detalle_xlsx(ctx["curso"].id, ctx["act"].id, EMAIL, None)
    cifrado_estudiantes.cifrar_pendientes(db_session.connection())
    registro = caplog.text
    for dato in (NOMBRE, CODIGO, CORREO, "MUÑOZ", clave):
        assert dato not in registro
