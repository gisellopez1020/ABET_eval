from typing import List, Optional
from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base
from .tipos import TextoCifrado


class Estudiante(Base):
    __tablename__ = "estudiantes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    # Datos personales: cifrados en la base con DATA_ENCRYPTION_KEY (RNF-14, tipos.py).
    # No se pueden filtrar ni ordenar en SQL: el orden por nombre va en Python.
    nombre_completo: Mapped[str] = mapped_column(TextoCifrado(200), nullable=False)
    codigo_estudiante: Mapped[str] = mapped_column(TextoCifrado(50), nullable=False)
    # Solo se llena si el archivo importado lo trae; nunca se deduce del nombre o el código
    email: Mapped[Optional[str]] = mapped_column(TextoCifrado(254), nullable=True)
    seccion_id: Mapped[int] = mapped_column(ForeignKey("secciones.id"), nullable=False, index=True)

    seccion: Mapped["Seccion"] = relationship("Seccion", back_populates="estudiantes")
    membresias: Mapped[List["MiembroEquipo"]] = relationship(
        "MiembroEquipo", back_populates="estudiante", cascade="all, delete-orphan"
    )
    calificaciones: Mapped[List["Calificacion"]] = relationship(
        "Calificacion", back_populates="estudiante", cascade="all, delete-orphan"
    )

    retroalimentaciones: Mapped[List["Retroalimentacion"]] = relationship(
        "Retroalimentacion", cascade="all, delete-orphan"
    )
