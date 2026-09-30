from decimal import Decimal
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, field_validator, model_validator


class ValorCriterio(BaseModel):
    criterio_id: int
    valor: int

    @field_validator("valor")
    @classmethod
    def validar_valor(cls, v: int) -> int:
        if v not in (0, 1):
            raise ValueError("El valor del criterio debe ser 0 o 1")
        return v


class CalificacionCreate(BaseModel):
    actividad_id: int
    criterios: List[ValorCriterio]
    equipo_id: Optional[int] = None
    estudiante_id: Optional[int] = None

    # model_validator y no field_validator: este último no corre si el campo se omite
    # (Pydantic no valida defaults) y el body sin ninguno de los dos llegaba a la BD
    @model_validator(mode="after")
    def validar_xor(self) -> "CalificacionCreate":
        if self.equipo_id is None and self.estudiante_id is None:
            raise ValueError("Debe especificar equipo_id o estudiante_id")
        if self.equipo_id is not None and self.estudiante_id is not None:
            raise ValueError("No puede especificar equipo_id y estudiante_id a la vez")
        return self


class CalificacionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    criterio_id: int
    valor: int
    nota_calculada: Decimal
    equipo_id: Optional[int]
    estudiante_id: Optional[int]
    created_at: datetime
    updated_at: datetime


class CalificacionUpdate(BaseModel):
    valor: int

    @field_validator("valor")
    @classmethod
    def validar_valor(cls, v: int) -> int:
        if v not in (0, 1):
            raise ValueError("El valor del criterio debe ser 0 o 1")
        return v


class CalificacionMasivo(BaseModel):
    criterios: List[ValorCriterio]
    seccion_id: int


class ResumenCalificacion(BaseModel):
    """Resumen de calificaciones de una actividad para una sección."""
    equipo_id: Optional[int] = None
    estudiante_id: Optional[int] = None
    nombre: str
    nota_total: Optional[Decimal] = None
    calificado: bool
    criterios_calificados: int
    criterios_totales: int
