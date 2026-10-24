import enum
from datetime import datetime
from typing import List
from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Numeric, String, Table, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class TipoActividad(str, enum.Enum):
    individual = "individual"
    grupal = "grupal"


# Secciones a las que aplica una actividad con alcance específico. Solo cuenta si
# aplica_todas_secciones es False: con True la actividad aplica a todas las secciones
# del curso, también a las que se creen después, y esta tabla no tiene filas suyas.
actividad_secciones = Table(
    "actividad_secciones",
    Base.metadata,
    Column("actividad_id", ForeignKey("actividades.id", ondelete="CASCADE"), primary_key=True),
    Column("seccion_id", ForeignKey("secciones.id", ondelete="CASCADE"), primary_key=True, index=True),
)


class Actividad(Base):
    __tablename__ = "actividades"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    tipo: Mapped[TipoActividad] = mapped_column(
        Enum(TipoActividad, name="tipo_actividad"), nullable=False
    )
    peso_nota_final: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    curso_id: Mapped[int] = mapped_column(ForeignKey("cursos.id"), nullable=False, index=True)
    # False: solo aplica a las secciones de `secciones` (puede quedar sin ninguna si se
    # borran; eso es "no aplica a ninguna", nunca "a todas")
    aplica_todas_secciones: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
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
    secciones: Mapped[List["Seccion"]] = relationship(
        "Seccion", secondary=actividad_secciones, back_populates="actividades_especificas",
        order_by="Seccion.id",
    )

    retroalimentaciones: Mapped[List["Retroalimentacion"]] = relationship(
        "Retroalimentacion", cascade="all, delete-orphan"
    )

    @property
    def secciones_ids(self) -> List[int]:
        """Ids de las secciones del alcance específico; vacío si aplica a todas."""
        return [] if self.aplica_todas_secciones else [s.id for s in self.secciones]

    def aplica_en(self, seccion_id: int) -> bool:
        """Si la actividad aplica en la sección (que ya se sabe del curso de la actividad)."""
        return self.aplica_todas_secciones or seccion_id in {s.id for s in self.secciones}
