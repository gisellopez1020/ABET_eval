import enum
from datetime import datetime
from typing import List
from sqlalchemy import String, Enum, Numeric, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class TipoActividad(str, enum.Enum):
    individual = "individual"
    grupal = "grupal"


class Actividad(Base):
    __tablename__ = "actividades"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    tipo: Mapped[TipoActividad] = mapped_column(
        Enum(TipoActividad, name="tipo_actividad"), nullable=False
    )
    peso_nota_final: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    curso_id: Mapped[int] = mapped_column(ForeignKey("cursos.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    curso: Mapped["Curso"] = relationship("Curso", back_populates="actividades")
    aspectos: Mapped[List["Aspecto"]] = relationship(
        "Aspecto", back_populates="actividad", cascade="all, delete-orphan", order_by="Aspecto.orden"
    )
    equipos: Mapped[List["EquipoTrabajo"]] = relationship(
        "EquipoTrabajo", back_populates="actividad", cascade="all, delete-orphan"
    )
