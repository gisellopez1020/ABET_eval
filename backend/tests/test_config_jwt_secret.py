"""
Validación de JWT_SECRET_KEY al instanciar Settings.

Con SKIP_AUTH=false la app no debe arrancar con un secreto público o débil,
porque cualquiera podría forjar un JWT válido. Con SKIP_AUTH=true (modo demo)
no se exige nada.
"""
import secrets

import pytest
from pydantic import ValidationError

from app.config import Settings


@pytest.fixture(autouse=True)
def entorno_limpio(monkeypatch):
    """Evita que variables de entorno del sistema influyan en los casos."""
    monkeypatch.delenv("SKIP_AUTH", raising=False)
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)


def crear_settings(**kwargs) -> Settings:
    # _env_file=None: ignora el .env local para que el test sea determinista
    return Settings(_env_file=None, **kwargs)


def test_auth_real_con_placeholder_falla_al_arrancar():
    with pytest.raises(ValidationError) as exc:
        crear_settings(skip_auth=False, jwt_secret_key="PLACEHOLDER")
    assert "JWT_SECRET_KEY" in str(exc.value)
    assert "SKIP_AUTH=false" in str(exc.value)


def test_auth_real_con_placeholder_por_defecto_falla_al_arrancar():
    with pytest.raises(ValidationError):
        crear_settings(skip_auth=False)


@pytest.mark.parametrize("secreto", ["", "   ", "a" * 31])
def test_auth_real_con_secreto_vacio_o_corto_falla_al_arrancar(secreto):
    with pytest.raises(ValidationError) as exc:
        crear_settings(skip_auth=False, jwt_secret_key=secreto)
    assert "JWT_SECRET_KEY" in str(exc.value)


def test_error_no_expone_el_secreto():
    secreto_corto = "secreto-corto-que-no-debe-filtrarse"[:31]
    with pytest.raises(ValidationError) as exc:
        crear_settings(skip_auth=False, jwt_secret_key=secreto_corto)
    assert secreto_corto not in str(exc.value)


def test_auth_real_con_secreto_real_arranca():
    secreto = secrets.token_urlsafe(32)
    config = crear_settings(skip_auth=False, jwt_secret_key=secreto)
    assert config.jwt_secret_key == secreto


def test_auth_real_con_secreto_de_32_caracteres_arranca():
    config = crear_settings(skip_auth=False, jwt_secret_key="a" * 32)
    assert config.skip_auth is False


def test_modo_demo_con_placeholder_arranca():
    config = crear_settings(skip_auth=True, jwt_secret_key="PLACEHOLDER")
    assert config.skip_auth is True


def test_variables_de_entorno_tambien_se_validan(monkeypatch):
    monkeypatch.setenv("SKIP_AUTH", "false")
    monkeypatch.setenv("JWT_SECRET_KEY", "PLACEHOLDER")
    with pytest.raises(ValidationError):
        crear_settings()
