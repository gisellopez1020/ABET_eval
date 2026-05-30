from typing import List
from sqlalchemy import String, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class Seccion(Base):
    __tablename__ = "secciones"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    curso_id: Mapped[int] = mapped_column(ForeignKey("cursos.id"), nullable=False, index=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    curso: Mapped["Curso"] = relationship("Curso", back_populates="secciones")
    estudiantes: Mapped[List["Estudiante"]] = relationship(
        "Estudiante", back_populates="seccion", cascade="all, delete-orphan"
    )
    equipos: Mapped[List["EquipoTrabajo"]] = relationship(
        "EquipoTrabajo", back_populates="seccion", cascade="all, delete-orphan"
    )
