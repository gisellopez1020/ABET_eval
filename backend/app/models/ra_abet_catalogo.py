from typing import Optional
from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base

PROGRAMA_DEFAULT = "Ingeniería Informática"


class RaAbetCatalogo(Base):
    """
    Catálogo de Student Outcomes / Resultados de Aprendizaje ABET del programa.
    Es global (compartido por todos los docentes); los cursos referencian
    los códigos desde curso.ra_abet.
    """
    __tablename__ = "ra_abet_catalogo"

    codigo: Mapped[str] = mapped_column(String(20), primary_key=True)
    so: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    competencia: Mapped[str] = mapped_column(String(200), nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    programa: Mapped[str] = mapped_column(
        String(200), nullable=False, default=PROGRAMA_DEFAULT, server_default=PROGRAMA_DEFAULT
    )
