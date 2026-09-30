"""estudiantes.email: correo real del estudiante, opcional.

Nullable y sin valor por defecto: solo se llena cuando el archivo importado trae
una columna Email/Correo. Nunca se calcula a partir del nombre o del código.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("estudiantes", sa.Column("email", sa.String(254), nullable=True))


def downgrade() -> None:
    op.drop_column("estudiantes", "email")
