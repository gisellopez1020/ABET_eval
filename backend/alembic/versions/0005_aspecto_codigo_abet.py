"""aspectos.codigo_abet: vínculo opcional con un Criterio del catálogo RA ABET.

FK sin ON DELETE: la base impide borrar del catálogo un código vinculado
(el router de catálogo responde 409 antes de llegar ahí).
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("aspectos", sa.Column("codigo_abet", sa.String(20), nullable=True))
    op.create_foreign_key(
        "fk_aspectos_codigo_abet",
        "aspectos",
        "ra_abet_catalogo",
        ["codigo_abet"],
        ["codigo"],
    )
    op.create_index("ix_aspectos_codigo_abet", "aspectos", ["codigo_abet"])


def downgrade() -> None:
    op.drop_index("ix_aspectos_codigo_abet", table_name="aspectos")
    op.drop_constraint("fk_aspectos_codigo_abet", "aspectos", type_="foreignkey")
    op.drop_column("aspectos", "codigo_abet")
