"""
Configuración compartida de pytest.
Los tests de utils y schemas no necesitan base de datos real.
"""
import os

# Forzar modo sin autenticación en tests
os.environ.setdefault("SKIP_AUTH", "true")
# Contraseña del largo que exige producción con SKIP_AUTH=false (las pruebas que
# validan el rechazo de abet_pass pasan su propia URL a Settings). Se fija siempre, no
# con setdefault: dentro del contenedor de desarrollo docker compose ya define
# DATABASE_URL (con la contraseña de ese .env) y las pruebas no deben depender de ella.
# No se conectan a esa base: usan SQLite en memoria.
os.environ["DATABASE_URL"] = (
    "postgresql://abet:contrasena-de-pruebas-larga@localhost:5432/abet_eval"
)
# Las pruebas nunca llaman a la API real de Gemini, aunque el .env tenga una key:
# la variable de entorno tiene prioridad sobre el .env. Las que prueban la redacción
# activan una key falsa y simulan la respuesta.
os.environ["GEMINI_API_KEY"] = "PLACEHOLDER"
# Los JWT de las pruebas se firman con una clave del largo que exige producción
# (las que validan el rechazo de claves inseguras pasan la suya a Settings).
os.environ.setdefault("JWT_SECRET_KEY", "clave-de-pruebas-" + "k" * 48)
