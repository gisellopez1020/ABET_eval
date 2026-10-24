"""Retroalimentación redactada con IA por equipo o estudiante en una actividad."""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "retroalimentaciones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actividad_id", sa.Integer(), sa.ForeignKey("actividades.id", ondelete="CASCADE"), nullable=False),
        sa.Column("equipo_id", sa.Integer(), sa.ForeignKey("equipos_trabajo.id", ondelete="CASCADE"), nullable=True),
        sa.Column("estudiante_id", sa.Integer(), sa.ForeignKey("estudiantes.id", ondelete="CASCADE"), nullable=True),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("huella", sa.String(64), nullable=False),
        sa.Column("modelo", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "(equipo_id IS NULL) != (estudiante_id IS NULL)",
            name="ck_retroalimentacion_xor_equipo_estudiante",
        ),
        sa.UniqueConstraint("actividad_id", "equipo_id", name="uq_retroalimentacion_equipo"),
        sa.UniqueConstraint("actividad_id", "estudiante_id", name="uq_retroalimentacion_estudiante"),
    )
    op.create_index("ix_retroalimentaciones_id", "retroalimentaciones", ["id"])
    op.create_index("ix_retroalimentaciones_actividad_id", "retroalimentaciones", ["actividad_id"])


def downgrade() -> None:
    op.drop_index("ix_retroalimentaciones_actividad_id", table_name="retroalimentaciones")
    op.drop_index("ix_retroalimentaciones_id", table_name="retroalimentaciones")
    op.drop_table("retroalimentaciones")
