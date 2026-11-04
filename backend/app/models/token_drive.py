from datetime import datetime
from sqlalchemy import String, Text, DateTime, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base


class TokenDrive(Base):
    """
    Refresh token de Google Drive de un docente, cifrado con TOKEN_ENCRYPTION_KEY.
    Permite seguir subiendo a Drive tras reiniciar el backend sin volver a iniciar
    sesión. El access_token (dura ~1 h) no se guarda: se renueva con este.
    """
    __tablename__ = "tokens_drive"
    __table_args__ = (UniqueConstraint("docente_email", name="uq_tokens_drive_docente_email"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    docente_email: Mapped[str] = mapped_column(String(200), nullable=False)
    refresh_token_cifrado: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
