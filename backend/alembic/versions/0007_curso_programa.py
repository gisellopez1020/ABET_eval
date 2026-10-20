"""Guardar la carrera de cada asignatura."""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "cursos",
        sa.Column("programa", sa.String(length=200), nullable=False, server_default="Ingeniería Informática"),
    )


def downgrade() -> None:
    op.drop_column("cursos", "programa")
