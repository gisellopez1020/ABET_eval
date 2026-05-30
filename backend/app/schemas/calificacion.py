from decimal import Decimal
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, field_validator


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

    @field_validator("estudiante_id")
    @classmethod
    def validar_xor(cls, v: Optional[int], info) -> Optional[int]:
        equipo_id = info.data.get("equipo_id")
        if equipo_id is None and v is None:
            raise ValueError("Debe especificar equipo_id o estudiante_id")
        if equipo_id is not None and v is not None:
            raise ValueError("No puede especificar equipo_id y estudiante_id a la vez")
        return v


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
