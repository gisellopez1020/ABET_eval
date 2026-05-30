from typing import List
from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class Estudiante(Base):
    __tablename__ = "estudiantes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nombre_completo: Mapped[str] = mapped_column(String(200), nullable=False)
    codigo_estudiante: Mapped[str] = mapped_column(String(50), nullable=False)
    seccion_id: Mapped[int] = mapped_column(ForeignKey("secciones.id"), nullable=False, index=True)

    seccion: Mapped["Seccion"] = relationship("Seccion", back_populates="estudiantes")
    membresias: Mapped[List["MiembroEquipo"]] = relationship(
        "MiembroEquipo", back_populates="estudiante", cascade="all, delete-orphan"
    )
    calificaciones: Mapped[List["Calificacion"]] = relationship(
        "Calificacion", back_populates="estudiante", cascade="all, delete-orphan"
    )
