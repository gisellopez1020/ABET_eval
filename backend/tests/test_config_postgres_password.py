"""
Con SKIP_AUTH=false el backend no arranca si la contraseña de PostgreSQL (la de
DATABASE_URL) es la de ejemplo, está vacía o es corta; y la app y Alembic toman la URL
de app.config.settings (no de os.getenv).
"""
import os
import subprocess
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings

BACKEND = Path(__file__).resolve().parents[1]
SECRETOS = {
    "jwt_secret_key": "clave-de-pruebas-" + "k" * 48,
    "token_encryption_key": "GNJnuPjUBH6t8mw5_wv8wuQYWftul65NqQCbyN-dInM=",
    "data_encryption_key": "gHVTAT3YyoVEYS0yZ6I-lVdvW748ie3pXtiHZVi4yQk=",
}


def _url(contrasena: str) -> str:
    return f"postgresql://abet:{contrasena}@postgres:5432/abet_eval"


def _settings(database_url: str, skip_auth: bool = False) -> Settings:
    return Settings(_env_file=None, skip_auth=skip_auth, database_url=database_url, **SECRETOS)


@pytest.mark.parametrize(
    "url",
    [
        _url("abet_pass"),
        _url("PLACEHOLDER"),
        _url("corta12345"),  # 10 caracteres
        "postgresql://abet:@postgres:5432/abet_eval",
        "postgresql://abet@postgres:5432/abet_eval",
        "postgresql+psycopg2://abet:abet_pass@postgres:5432/abet_eval",
    ],
)
def test_login_real_con_contrasena_insegura_no_arranca(url):
    with pytest.raises(ValidationError) as exc:
        _settings(url)
    mensaje = str(exc.value)
    assert "La contraseña de PostgreSQL" in mensaje
    # El mensaje dice qué hacer: generarla, cambiarla en la base y en el .env
    assert "secrets.token_urlsafe(18)" in mensaje
    assert "\\password abet" in mensaje
    assert "POSTGRES_PASSWORD" in mensaje
    assert "DESPLIEGUE_PRODUCCION.md" in mensaje


def test_el_mensaje_no_muestra_la_contrasena_ni_la_url():
    with pytest.raises(ValidationError) as exc:
        _settings(_url("corta-secr"))
    assert "corta-secr" not in str(exc.value)


@pytest.mark.parametrize("contrasena", ["x" * 12, "Zr8w-lQ_4mT1pX9a2KcYvB3s"])
def test_contrasena_de_12_o_mas_arranca(contrasena):
    assert _settings(_url(contrasena)).database_url == _url(contrasena)


def test_con_skip_auth_no_se_exige(monkeypatch):
    _settings(_url("abet_pass"), skip_auth=True)


def test_sqlite_no_tiene_contrasena_y_no_se_revisa():
    _settings("sqlite:///:memory:")


def test_la_variable_de_entorno_tambien_se_valida(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", _url("abet_pass"))
    with pytest.raises(ValidationError):
        Settings(_env_file=None, skip_auth=False, **SECRETOS)


def test_database_y_alembic_toman_la_url_de_settings():
    database_py = (BACKEND / "app/database.py").read_text(encoding="utf-8")
    env_py = (BACKEND / "alembic/env.py").read_text(encoding="utf-8")
    assert "DATABASE_URL = settings.database_url" in database_py
    assert "settings.database_url" in env_py
    for fuente in (database_py, env_py):
        assert "os.getenv(" not in fuente and "os.environ" not in fuente


def test_alembic_se_detiene_antes_de_migrar_con_la_contrasena_de_ejemplo():
    # Como en el arranque del contenedor (alembic upgrade head && ...): con login real
    # y abet_pass, Alembic falla al importar Settings, antes de conectarse a la base
    entorno = {
        **os.environ,
        "SKIP_AUTH": "false",
        "DATABASE_URL": _url("abet_pass"),
        "JWT_SECRET_KEY": SECRETOS["jwt_secret_key"],
        "TOKEN_ENCRYPTION_KEY": SECRETOS["token_encryption_key"],
        "DATA_ENCRYPTION_KEY": SECRETOS["data_encryption_key"],
    }
    exe = Path(sys.executable).parent / ("alembic.exe" if os.name == "nt" else "alembic")
    r = subprocess.run(
        [str(exe), "upgrade", "head", "--sql"],
        cwd=BACKEND, env=entorno, capture_output=True, text=True, timeout=60,
    )
    assert r.returncode != 0
    assert "La contraseña de PostgreSQL" in r.stderr
