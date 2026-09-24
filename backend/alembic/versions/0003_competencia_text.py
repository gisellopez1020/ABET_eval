"""ra_abet_catalogo.competencia: VARCHAR(200) -> TEXT.

La redacción oficial de algunas competencias ABET supera los 200 caracteres.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "ra_abet_catalogo",
        "competencia",
        type_=sa.Text(),
        existing_type=sa.String(200),
        existing_nullable=False,
    )


def downgrade() -> None:
    # No truncar en silencio la redacción oficial: si hay textos largos, detenerse.
    largas = op.get_bind().execute(
        sa.text("SELECT COUNT(*) FROM ra_abet_catalogo WHERE char_length(competencia) > 200")
    ).scalar()
    if largas:
        raise RuntimeError(
            f"No se puede volver a VARCHAR(200): {largas} competencia(s) del catálogo "
            "superan los 200 caracteres. Acórtelas manualmente antes de hacer downgrade."
        )
    op.alter_column(
        "ra_abet_catalogo",
        "competencia",
        type_=sa.String(200),
        existing_type=sa.Text(),
        existing_nullable=False,
    )
