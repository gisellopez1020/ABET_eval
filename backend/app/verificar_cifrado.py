"""
Paso de arranque del backend, entre las migraciones y uvicorn (ver los docker-compose):

    alembic upgrade head && python -m app.verificar_cifrado && exec uvicorn ...

- Si hay datos de estudiantes cifrados y DATA_ENCRYPTION_KEY falta o no es la clave
  con que se cifraron, termina con error y un mensaje claro: el backend no arranca,
  en vez de responder errores o mostrar datos ilegibles.
- Con clave, cifra los valores que sigan en claro (p. ej. una instalación con
  SKIP_AUTH=true que empezó sin clave y luego la configuró). Idempotente.
- Sin clave (solo posible con SKIP_AUTH=true), avisa que los datos quedan en claro.

No va en el arranque de FastAPI (lifespan) para que las pruebas, que usan SQLite y
levantan la app, no necesiten PostgreSQL. Nunca imprime datos ni claves: solo cantidades.
"""
import sys

from app.database import engine
from app.services import cifrado_estudiantes
from app.utils.cifrado import DatosIlegibles, clave_datos_configurada

AVISO_EN_CLARO = (
    "AVISO: DATA_ENCRYPTION_KEY no está configurada (permitido solo con SKIP_AUTH=true): "
    "los nombres, códigos y correos de los estudiantes se guardan SIN CIFRAR. "
    "Configúrala para cifrarlos (ver DESPLIEGUE_PRODUCCION.md)."
)


def ejecutar(conexion) -> int:
    """0 si el backend puede arrancar, 1 si no. Imprime el motivo."""
    try:
        cifrado_estudiantes.verificar_clave(conexion)
    except DatosIlegibles as exc:
        print(f"ERROR: {exc} El backend no arranca.", file=sys.stderr)
        return 1
    if not clave_datos_configurada():
        print(AVISO_EN_CLARO, file=sys.stderr)
        return 0
    cifrados = cifrado_estudiantes.cifrar_pendientes(conexion)
    estado = cifrado_estudiantes.estado(conexion)
    if cifrados:
        print(f"Cifrado en reposo: se cifraron {cifrados} estudiantes que estaban en claro.")
    print(
        f"Cifrado en reposo: {estado.estudiantes} estudiantes, "
        f"{estado.valores_en_claro} valores en claro."
    )
    return 0


def main() -> int:
    with engine.begin() as conexion:
        return ejecutar(conexion)


if __name__ == "__main__":
    sys.exit(main())
