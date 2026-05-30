from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict, field_validator
from app.models.actividad import TipoActividad


class ActividadCreate(BaseModel):
    nombre: str
    tipo: TipoActividad
    peso_nota_final: Decimal

    @field_validator("peso_nota_final")
    @classmethod
    def validar_peso(cls, v: Decimal) -> Decimal:
        if v <= 0 or v > 100:
            raise ValueError("El peso en nota final debe estar entre 0.01 y 100")
        return v


class ActividadUpdate(BaseModel):
    nombre: Optional[str] = None
    peso_nota_final: Optional[Decimal] = None

    @field_validator("peso_nota_final")
    @classmethod
    def validar_peso(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and (v <= 0 or v > 100):
            raise ValueError("El peso en nota final debe estar entre 0.01 y 100")
        return v


class ActividadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    tipo: TipoActividad
    peso_nota_final: Decimal
    curso_id: int
    created_at: datetime
