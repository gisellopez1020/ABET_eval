"""Configuración ABET: rangos de calificación por curso y catálogo de RA ABET.

- cursos.rangos_calificacion (JSON, NOT NULL): los cursos existentes reciben
  los 3 rangos por defecto vía server_default.
- ra_abet_catalogo: tabla vacía; los datos se cargan desde la pantalla
  "Student Outcomes" (CRUD / importación CSV), no desde la migración.
"""
import json
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Copia literal (no importada de app.models) para que la migración no cambie
# si el default del código cambia en el futuro.
RANGOS_DEFAULT = [
    {"etiqueta": "0.0-2.9", "minimo": 0.0, "maximo": 2.9},
    {"etiqueta": "3.0-3.9", "minimo": 3.0, "maximo": 3.9},
    {"etiqueta": "4.0-5.0", "minimo": 4.0, "maximo": 5.0},
]


def upgrade() -> None:
    op.add_column(
        "cursos",
        sa.Column(
            "rangos_calificacion",
            sa.JSON(),
            nullable=False,
            server_default=sa.text(f"'{json.dumps(RANGOS_DEFAULT)}'"),
        ),
    )

    op.create_table(
        "ra_abet_catalogo",
        sa.Column("codigo", sa.String(20), primary_key=True),
        sa.Column("so", sa.String(20), nullable=True),
        sa.Column("competencia", sa.String(200), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=False),
        sa.Column(
            "programa",
            sa.String(200),
            nullable=False,
            server_default="Ingeniería Informática",
        ),
    )


def downgrade() -> None:
    op.drop_table("ra_abet_catalogo")
    op.drop_column("cursos", "rangos_calificacion")
