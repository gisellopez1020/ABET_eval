from datetime import datetime
from decimal import Decimal
from typing import Optional
from sqlalchemy import SmallInteger, Numeric, ForeignKey, DateTime, CheckConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class Calificacion(Base):
    __tablename__ = "calificaciones"
    __table_args__ = (
        # equipo_id XOR estudiante_id: exactamente uno debe estar presente
        CheckConstraint(
            "(equipo_id IS NULL) != (estudiante_id IS NULL)",
            name="ck_calificacion_xor_equipo_estudiante",
        ),
        CheckConstraint("valor IN (0, 1)", name="ck_calificacion_valor_binario"),
        CheckConstraint(
            "nota_calculada >= 0.0 AND nota_calculada <= 5.0",
            name="ck_calificacion_nota_rango",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    criterio_id: Mapped[int] = mapped_column(ForeignKey("criterios.id"), nullable=False, index=True)
    valor: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    equipo_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("equipos_trabajo.id"), nullable=True, index=True
    )
    estudiante_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("estudiantes.id"), nullable=True, index=True
    )
    nota_calculada: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    criterio: Mapped["Criterio"] = relationship("Criterio", back_populates="calificaciones")
    equipo: Mapped[Optional["EquipoTrabajo"]] = relationship(
        "EquipoTrabajo", back_populates="calificaciones"
    )
    estudiante: Mapped[Optional["Estudiante"]] = relationship(
        "Estudiante", back_populates="calificaciones"
    )
