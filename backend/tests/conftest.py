"""
Configuración compartida de pytest.
Los tests de utils y schemas no necesitan base de datos real.
"""
import os

# Forzar modo sin autenticación en tests
os.environ.setdefault("SKIP_AUTH", "true")
os.environ.setdefault(
    "DATABASE_URL", "postgresql://abet:abet_pass@localhost:5432/abet_eval"
)
# Las pruebas nunca llaman a la API real de Gemini, aunque el .env tenga una key:
# la variable de entorno tiene prioridad sobre el .env. Las que prueban la redacción
# activan una key falsa y simulan la respuesta.
os.environ["GEMINI_API_KEY"] = "PLACEHOLDER"
