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
