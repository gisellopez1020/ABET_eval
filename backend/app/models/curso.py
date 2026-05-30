from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, Boolean, DateTime, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class Curso(Base):
    __tablename__ = "cursos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    codigo: Mapped[str] = mapped_column(String(50), nullable=False)
    periodo: Mapped[str] = mapped_column(String(20), nullable=False)
    docente_email: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    ra_abet: Mapped[Optional[List]] = mapped_column(JSON, default=list)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    secciones: Mapped[List["Seccion"]] = relationship(
        "Seccion", back_populates="curso", cascade="all, delete-orphan"
    )
    actividades: Mapped[List["Actividad"]] = relationship(
        "Actividad", back_populates="curso", cascade="all, delete-orphan"
    )
