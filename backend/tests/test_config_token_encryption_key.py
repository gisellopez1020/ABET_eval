"""
Validación de TOKEN_ENCRYPTION_KEY al instanciar Settings.

Con SKIP_AUTH=false el refresh_token de Google Drive se guarda cifrado en la base:
la app no debe arrancar sin una clave Fernet válida (con PLACEHOLDER la clave sería
pública). Con SKIP_AUTH=true (modo demo) Drive se simula y no se exige nada.
"""
import base64
import os

import pytest
from cryptography.fernet import Fernet
from pydantic import ValidationError

from app.config import Settings

JWT = "a" * 32


@pytest.fixture(autouse=True)
def entorno_limpio(monkeypatch):
    """Evita que variables de entorno del sistema influyan en los casos."""
    for variable in ("SKIP_AUTH", "JWT_SECRET_KEY", "TOKEN_ENCRYPTION_KEY"):
        monkeypatch.delenv(variable, raising=False)


def crear_settings(**kwargs) -> Settings:
    # _env_file=None: ignora el .env local para que el test sea determinista
    return Settings(_env_file=None, **kwargs)


def clave_como_powershell() -> str:
    """Lo que genera el comando de SETUP_GOOGLE.md: base64 de 32 bytes con + y / cambiados."""
    return base64.b64encode(os.urandom(32)).decode().replace("+", "-").replace("/", "_")


# ── Login real: obligatoria ──────────────────────────────────────────────────

def test_por_defecto_falla_al_arrancar():
    with pytest.raises(ValidationError) as exc:
        crear_settings(skip_auth=False, jwt_secret_key=JWT)
    assert "TOKEN_ENCRYPTION_KEY" in str(exc.value)
    assert "SKIP_AUTH=false" in str(exc.value)


@pytest.mark.parametrize("clave", [
    "PLACEHOLDER",
    "",
    "   ",
    "corta",
    "!" * 44,  # largo correcto, caracteres no válidos
    base64.urlsafe_b64encode(os.urandom(16)).decode(),  # base64 válido pero de 16 bytes
])
def test_clave_invalida_falla_al_arrancar(clave):
    with pytest.raises(ValidationError) as exc:
        crear_settings(skip_auth=False, jwt_secret_key=JWT, token_encryption_key=clave)
    assert "TOKEN_ENCRYPTION_KEY no es una clave Fernet válida" in str(exc.value)


def test_error_no_expone_la_clave():
    casi = Fernet.generate_key().decode()[:-2]  # le faltan caracteres: inválida
    with pytest.raises(ValidationError) as exc:
        crear_settings(skip_auth=False, jwt_secret_key=JWT, token_encryption_key=casi)
    assert casi not in str(exc.value)


@pytest.mark.parametrize("clave", [Fernet.generate_key().decode(), clave_como_powershell()])
def test_clave_valida_arranca(clave):
    config = crear_settings(skip_auth=False, jwt_secret_key=JWT, token_encryption_key=clave)
    assert config.token_encryption_key == clave


def test_espacios_alrededor_se_ignoran():
    clave = Fernet.generate_key().decode()
    crear_settings(skip_auth=False, jwt_secret_key=JWT, token_encryption_key=f"  {clave}  ")


def test_el_error_del_jwt_va_primero():
    """Con las dos claves mal, se ve el mensaje de siempre (JWT_SECRET_KEY)."""
    with pytest.raises(ValidationError) as exc:
        crear_settings(skip_auth=False)
    assert "JWT_SECRET_KEY no está configurada de forma segura" in str(exc.value)
    assert "TOKEN_ENCRYPTION_KEY" not in str(exc.value)


def test_variables_de_entorno_tambien_se_validan(monkeypatch):
    monkeypatch.setenv("SKIP_AUTH", "false")
    monkeypatch.setenv("JWT_SECRET_KEY", JWT)
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", "PLACEHOLDER")
    with pytest.raises(ValidationError):
        crear_settings()
    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", clave_como_powershell())
    assert crear_settings().skip_auth is False


# ── Modo demo: no se exige ───────────────────────────────────────────────────

@pytest.mark.parametrize("clave", ["PLACEHOLDER", "", "corta"])
def test_modo_demo_no_la_exige(clave):
    config = crear_settings(skip_auth=True, token_encryption_key=clave)
    assert config.skip_auth is True
