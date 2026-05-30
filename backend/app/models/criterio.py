from decimal import Decimal
from typing import List
from sqlalchemy import String, Integer, Numeric, ForeignKey, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class Criterio(Base):
    __tablename__ = "criterios"
    __table_args__ = (
        CheckConstraint("peso_porcentaje >= 0 AND peso_porcentaje <= 100", name="ck_criterio_peso_rango"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    texto: Mapped[str] = mapped_column(String(500), nullable=False)
    peso_porcentaje: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    aspecto_id: Mapped[int] = mapped_column(ForeignKey("aspectos.id"), nullable=False, index=True)
    orden: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    aspecto: Mapped["Aspecto"] = relationship("Aspecto", back_populates="criterios")
    calificaciones: Mapped[List["Calificacion"]] = relationship(
        "Calificacion", back_populates="criterio", cascade="all, delete-orphan"
    )
