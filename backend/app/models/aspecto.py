from typing import List
from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class Aspecto(Base):
    __tablename__ = "aspectos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    actividad_id: Mapped[int] = mapped_column(ForeignKey("actividades.id"), nullable=False, index=True)
    orden: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    actividad: Mapped["Actividad"] = relationship("Actividad", back_populates="aspectos")
    criterios: Mapped[List["Criterio"]] = relationship(
        "Criterio", back_populates="aspecto", cascade="all, delete-orphan", order_by="Criterio.orden"
    )
