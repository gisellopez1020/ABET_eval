from typing import List
from sqlalchemy import String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class EquipoTrabajo(Base):
    __tablename__ = "equipos_trabajo"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    actividad_id: Mapped[int] = mapped_column(ForeignKey("actividades.id"), nullable=False, index=True)
    seccion_id: Mapped[int] = mapped_column(ForeignKey("secciones.id"), nullable=False, index=True)

    actividad: Mapped["Actividad"] = relationship("Actividad", back_populates="equipos")
    seccion: Mapped["Seccion"] = relationship("Seccion", back_populates="equipos")
    miembros: Mapped[List["MiembroEquipo"]] = relationship(
        "MiembroEquipo", back_populates="equipo", cascade="all, delete-orphan"
    )
    calificaciones: Mapped[List["Calificacion"]] = relationship(
        "Calificacion", back_populates="equipo", cascade="all, delete-orphan"
    )


class MiembroEquipo(Base):
    __tablename__ = "miembros_equipo"
    __table_args__ = (
        UniqueConstraint("equipo_id", "estudiante_id", name="uq_miembro_equipo"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    equipo_id: Mapped[int] = mapped_column(ForeignKey("equipos_trabajo.id"), nullable=False, index=True)
    estudiante_id: Mapped[int] = mapped_column(ForeignKey("estudiantes.id"), nullable=False, index=True)

    equipo: Mapped["EquipoTrabajo"] = relationship("EquipoTrabajo", back_populates="miembros")
    estudiante: Mapped["Estudiante"] = relationship("Estudiante", back_populates="membresias")
