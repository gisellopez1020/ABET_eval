from typing import Optional
from sqlalchemy import CheckConstraint, Float, ForeignKeyConstraint, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base

PROGRAMA_DEFAULT = "Ingeniería Informática"


class RaAbetCatalogo(Base):
    """
    Catálogo de Student Outcomes / Resultados de Aprendizaje ABET del programa.
    Es global (compartido por todos los docentes).

    Dos niveles en la misma tabla:
    - Resultado de Aprendizaje (P.I., ej. "2.1"): codigo_padre y peso en NULL.
      Es lo que los cursos referencian desde curso.ra_abet.
    - Criterio de Evaluación (ej. "2.1.1"): codigo_padre apunta a su RA y
      peso (0 < peso <= 1) es su peso dentro del RA.
    Nunca hay un tercer nivel (lo valida el router: requiere consultar la BD).
    """
    __tablename__ = "ra_abet_catalogo"
    __table_args__ = (
        ForeignKeyConstraint(
            ["codigo_padre"], ["ra_abet_catalogo.codigo"], name="fk_ra_abet_catalogo_padre"
        ),
        CheckConstraint("codigo_padre IS NULL OR codigo_padre <> codigo", name="ck_ra_abet_no_autopadre"),
        CheckConstraint(
            "(codigo_padre IS NULL AND peso IS NULL) OR "
            "(codigo_padre IS NOT NULL AND peso IS NOT NULL AND peso > 0 AND peso <= 1)",
            name="ck_ra_abet_padre_peso",
        ),
    )

    codigo: Mapped[str] = mapped_column(String(20), primary_key=True)
    so: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    competencia: Mapped[str] = mapped_column(Text, nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    programa: Mapped[str] = mapped_column(
        String(200), nullable=False, default=PROGRAMA_DEFAULT, server_default=PROGRAMA_DEFAULT
    )
    codigo_padre: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    peso: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
