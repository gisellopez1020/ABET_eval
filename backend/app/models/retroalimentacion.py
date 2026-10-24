from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, ForeignKey, DateTime, CheckConstraint, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base


class Retroalimentacion(Base):
    """
    Retroalimentación redactada con IA para un equipo o estudiante en una actividad.
    Es una caché: `huella` resume los datos con que se generó (textos de la rúbrica y
    valores calificados); si cambian, se vuelve a redactar. Solo se guardan las
    redactadas con IA, nunca la estructurada (esa se arma de la BD en cada lectura).
    """
    __tablename__ = "retroalimentaciones"
    __table_args__ = (
        CheckConstraint(
            "(equipo_id IS NULL) != (estudiante_id IS NULL)",
            name="ck_retroalimentacion_xor_equipo_estudiante",
        ),
        # Únicos planos: NULL nunca es igual a NULL, así que las filas de estudiantes
        # (equipo_id NULL) no chocan entre sí en el primero, ni las de equipos en el segundo
        UniqueConstraint("actividad_id", "equipo_id", name="uq_retroalimentacion_equipo"),
        UniqueConstraint("actividad_id", "estudiante_id", name="uq_retroalimentacion_estudiante"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    actividad_id: Mapped[int] = mapped_column(
        ForeignKey("actividades.id", ondelete="CASCADE"), nullable=False, index=True
    )
    equipo_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("equipos_trabajo.id", ondelete="CASCADE"), nullable=True
    )
    estudiante_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("estudiantes.id", ondelete="CASCADE"), nullable=True
    )
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    # SHA-256 (hex) de los datos de entrada
    huella: Mapped[str] = mapped_column(String(64), nullable=False)
    modelo: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
