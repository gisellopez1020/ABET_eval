import copy
import json
from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, Boolean, DateTime, JSON, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base

# Rangos por defecto del reporte ABET (mismas etiquetas que usaba reportes.py).
# Intervalos cerrados [minimo, maximo] sobre la escala 0-5.
RANGOS_CALIFICACION_DEFAULT = [
    {"etiqueta": "0.0-2.9", "minimo": 0.0, "maximo": 2.9},
    {"etiqueta": "3.0-3.9", "minimo": 3.0, "maximo": 3.9},
    {"etiqueta": "4.0-5.0", "minimo": 4.0, "maximo": 5.0},
]


def _rangos_default() -> list:
    return copy.deepcopy(RANGOS_CALIFICACION_DEFAULT)


class Curso(Base):
    __tablename__ = "cursos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    codigo: Mapped[str] = mapped_column(String(50), nullable=False)
    periodo: Mapped[str] = mapped_column(String(20), nullable=False)
    docente_email: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    # Códigos de ra_abet_catalogo (ej. ["2.1", "4.2"])
    ra_abet: Mapped[Optional[List]] = mapped_column(JSON, default=list)
    rangos_calificacion: Mapped[List] = mapped_column(
        JSON,
        nullable=False,
        default=_rangos_default,
        server_default=text(f"'{json.dumps(RANGOS_CALIFICACION_DEFAULT)}'"),
    )
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
