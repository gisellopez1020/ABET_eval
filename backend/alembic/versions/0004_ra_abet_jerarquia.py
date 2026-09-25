"""ra_abet_catalogo: segundo nivel (Criterio de Evaluación) con codigo_padre y peso.

- Resultado de Aprendizaje: codigo_padre y peso en NULL.
- Criterio: codigo_padre -> ra_abet_catalogo.codigo y 0 < peso <= 1.

downgrade quita las columnas: los Criterios quedan como filas planas
(no se borran para no destruir datos).
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("ra_abet_catalogo", sa.Column("codigo_padre", sa.String(20), nullable=True))
    op.add_column("ra_abet_catalogo", sa.Column("peso", sa.Float(), nullable=True))
    op.create_foreign_key(
        "fk_ra_abet_catalogo_padre",
        "ra_abet_catalogo",
        "ra_abet_catalogo",
        ["codigo_padre"],
        ["codigo"],
    )
    op.create_index("ix_ra_abet_catalogo_codigo_padre", "ra_abet_catalogo", ["codigo_padre"])
    op.create_check_constraint(
        "ck_ra_abet_no_autopadre",
        "ra_abet_catalogo",
        "codigo_padre IS NULL OR codigo_padre <> codigo",
    )
    op.create_check_constraint(
        "ck_ra_abet_padre_peso",
        "ra_abet_catalogo",
        "(codigo_padre IS NULL AND peso IS NULL) OR "
        "(codigo_padre IS NOT NULL AND peso IS NOT NULL AND peso > 0 AND peso <= 1)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_ra_abet_padre_peso", "ra_abet_catalogo", type_="check")
    op.drop_constraint("ck_ra_abet_no_autopadre", "ra_abet_catalogo", type_="check")
    op.drop_index("ix_ra_abet_catalogo_codigo_padre", table_name="ra_abet_catalogo")
    op.drop_constraint("fk_ra_abet_catalogo_padre", "ra_abet_catalogo", type_="foreignkey")
    op.drop_column("ra_abet_catalogo", "peso")
    op.drop_column("ra_abet_catalogo", "codigo_padre")
