"""Refresh token de Google Drive por docente, cifrado, para que sobreviva a reinicios."""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tokens_drive",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("docente_email", sa.String(200), nullable=False),
        sa.Column("refresh_token_cifrado", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("docente_email", name="uq_tokens_drive_docente_email"),
    )
    op.create_index("ix_tokens_drive_id", "tokens_drive", ["id"])


def downgrade() -> None:
    op.drop_index("ix_tokens_drive_id", table_name="tokens_drive")
    op.drop_table("tokens_drive")
