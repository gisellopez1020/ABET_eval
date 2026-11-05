"""Cifrado en reposo del nombre, el código y el correo de los estudiantes (RNF-14).

upgrade: las tres columnas pasan a TEXT (el valor cifrado ocupa más que el original)
y se cifran los valores existentes con DATA_ENCRYPTION_KEY, con el prefijo enc:v1:.
Idempotente: lo ya cifrado no se vuelve a cifrar.

- Con SKIP_AUTH=false y sin DATA_ENCRYPTION_KEY no migra nada y falla con un mensaje
  claro (de hecho ya falla antes, al validar la configuración en alembic/env.py).
- Con SKIP_AUTH=true y sin clave solo cambia el tipo de las columnas; los datos quedan
  en claro y app/verificar_cifrado.py los cifra cuando se configure la clave.

downgrade: descifra (exige la misma clave) y vuelve a VARCHAR(200/50/254). Si un
valor no cabe, falla sin cambiar nada.

Toda la migración corre en una transacción de PostgreSQL: si algo falla, la base queda
como estaba. Aun así, haz un respaldo antes de actualizar (DESPLIEGUE_PRODUCCION.md).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.config import settings
from app.services import cifrado_estudiantes
from app.utils.cifrado import clave_datos_configurada

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if not clave_datos_configurada() and not settings.skip_auth:
        raise RuntimeError(
            "Migración 0012 no aplicada: con SKIP_AUTH=false hace falta DATA_ENCRYPTION_KEY "
            "para cifrar los datos de los estudiantes. Configúrala y vuelve a arrancar."
        )
    for columna, largo in cifrado_estudiantes.COLUMNAS.items():
        op.alter_column(
            "estudiantes", columna, type_=sa.Text(), existing_type=sa.String(largo),
            existing_nullable=columna == "email",
        )
    conexion = op.get_bind()
    if clave_datos_configurada():
        cifrados = cifrado_estudiantes.cifrar_pendientes(conexion)
        print(f"Migración 0012: {cifrados} estudiantes cifrados.")
    else:
        print(
            "Migración 0012: sin DATA_ENCRYPTION_KEY (SKIP_AUTH=true), los datos de los "
            "estudiantes quedan sin cifrar hasta que se configure la clave."
        )


def downgrade() -> None:
    conexion = op.get_bind()
    descifrados = cifrado_estudiantes.descifrar_todos(conexion)
    for columna, largo in cifrado_estudiantes.COLUMNAS.items():
        op.alter_column(
            "estudiantes", columna, type_=sa.String(largo), existing_type=sa.Text(),
            existing_nullable=columna == "email",
        )
    print(f"Migración 0012 revertida: {descifrados} estudiantes descifrados.")
