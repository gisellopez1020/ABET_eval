from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.curso import RANGOS_CALIFICACION_DEFAULT

MAX_RA_ABET = 10
MAX_RANGOS = 10
NOTA_MIN = 0.0
NOTA_MAX = 5.0


class RangoCalificacion(BaseModel):
    """
    Rango del reporte ABET: intervalo cerrado [minimo, maximo] en la escala 0-5.
    Se usa float (no Decimal) porque se persiste en una columna JSON.
    """
    etiqueta: str
    minimo: float
    maximo: float

    @field_validator("etiqueta")
    @classmethod
    def validar_etiqueta(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("La etiqueta del rango no puede estar vacía")
        return v

    @model_validator(mode="after")
    def validar_limites(self) -> "RangoCalificacion":
        if not (NOTA_MIN <= self.minimo <= NOTA_MAX and NOTA_MIN <= self.maximo <= NOTA_MAX):
            raise ValueError(
                f"Rango '{self.etiqueta}': los límites deben estar entre {NOTA_MIN} y {NOTA_MAX}"
            )
        if self.minimo >= self.maximo:
            raise ValueError(f"Rango '{self.etiqueta}': el mínimo debe ser menor que el máximo")
        return self


def validar_rangos(rangos: List[RangoCalificacion]) -> List[RangoCalificacion]:
    """
    Al menos 1 y máximo 10 rangos, etiquetas únicas y sin solapamiento
    (intervalos cerrados: [0, 3] y [3, 4] se solapan en 3). No exige cubrir
    todo 0-5: se permiten huecos. Devuelve los rangos ordenados por mínimo.
    """
    if len(rangos) < 1:
        raise ValueError("Debe definir al menos un rango de calificación")
    if len(rangos) > MAX_RANGOS:
        raise ValueError(f"Máximo {MAX_RANGOS} rangos de calificación permitidos")

    etiquetas = [r.etiqueta.lower() for r in rangos]
    if len(set(etiquetas)) != len(etiquetas):
        raise ValueError("Las etiquetas de los rangos no pueden repetirse")

    ordenados = sorted(rangos, key=lambda r: r.minimo)
    for anterior, actual in zip(ordenados, ordenados[1:]):
        if actual.minimo <= anterior.maximo:
            raise ValueError(f"Los rangos '{anterior.etiqueta}' y '{actual.etiqueta}' se solapan")
    return ordenados


def limpiar_ra_abet(codigos: List[str]) -> List[str]:
    """Quita espacios y descarta vacíos y duplicados, conservando el orden."""
    limpios: List[str] = []
    for codigo in codigos:
        codigo = codigo.strip()
        if codigo and codigo not in limpios:
            limpios.append(codigo)
    if len(limpios) > MAX_RA_ABET:
        raise ValueError(f"Máximo {MAX_RA_ABET} resultados de aprendizaje ABET permitidos")
    return limpios


def _rangos_default() -> List[RangoCalificacion]:
    return [RangoCalificacion(**r) for r in RANGOS_CALIFICACION_DEFAULT]


class CursoCreate(BaseModel):
    nombre: str
    codigo: str
    periodo: str
    # Códigos de ra_abet_catalogo; su existencia se valida en el router (requiere BD)
    ra_abet: List[str] = []
    rangos_calificacion: List[RangoCalificacion] = Field(default_factory=_rangos_default)

    @field_validator("ra_abet")
    @classmethod
    def validar_ra_abet(cls, v: List[str]) -> List[str]:
        return limpiar_ra_abet(v)

    @field_validator("rangos_calificacion")
    @classmethod
    def validar_rangos_calificacion(cls, v: List[RangoCalificacion]) -> List[RangoCalificacion]:
        return validar_rangos(v)


class CursoUpdate(BaseModel):
    nombre: Optional[str] = None
    codigo: Optional[str] = None
    periodo: Optional[str] = None
    ra_abet: Optional[List[str]] = None
    rangos_calificacion: Optional[List[RangoCalificacion]] = None

    @field_validator("ra_abet")
    @classmethod
    def validar_ra_abet(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        return limpiar_ra_abet(v) if v is not None else v

    @field_validator("rangos_calificacion")
    @classmethod
    def validar_rangos_calificacion(
        cls, v: Optional[List[RangoCalificacion]]
    ) -> Optional[List[RangoCalificacion]]:
        return validar_rangos(v) if v is not None else v


class CursoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    codigo: str
    periodo: str
    docente_email: str
    ra_abet: List[str] = []
    rangos_calificacion: List[RangoCalificacion] = Field(default_factory=_rangos_default)
    activo: bool
    created_at: datetime
