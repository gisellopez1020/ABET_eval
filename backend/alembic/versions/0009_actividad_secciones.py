"""Alcance de una actividad: todas las secciones del curso o solo algunas."""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Las actividades existentes quedan con True: hoy todas aplican a todas sus secciones
    op.add_column(
        "actividades",
        sa.Column("aplica_todas_secciones", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_table(
        "actividad_secciones",
        sa.Column("actividad_id", sa.Integer(), sa.ForeignKey("actividades.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("seccion_id", sa.Integer(), sa.ForeignKey("secciones.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_index("ix_actividad_secciones_seccion_id", "actividad_secciones", ["seccion_id"])


def downgrade() -> None:
    op.drop_index("ix_actividad_secciones_seccion_id", table_name="actividad_secciones")
    op.drop_table("actividad_secciones")
    op.drop_column("actividades", "aplica_todas_secciones")
