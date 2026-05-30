from decimal import Decimal
from typing import List
from pydantic import BaseModel, ConfigDict, field_validator


class CriterioIn(BaseModel):
    texto: str
    peso_porcentaje: Decimal
    orden: int = 0

    @field_validator("peso_porcentaje")
    @classmethod
    def validar_peso(cls, v: Decimal) -> Decimal:
        if v < 0 or v > 100:
            raise ValueError("El peso debe estar entre 0 y 100")
        return v


class CriterioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    texto: str
    peso_porcentaje: Decimal
    aspecto_id: int
    orden: int


class AspectoIn(BaseModel):
    nombre: str
    orden: int = 0
    criterios: List[CriterioIn]


class AspectoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    orden: int
    criterios: List[CriterioOut]


class CriteriosPayload(BaseModel):
    """Payload para reemplazar todos los criterios de una actividad."""
    aspectos: List[AspectoIn]


class CriteriosResponse(BaseModel):
    aspectos: List[AspectoOut]
    total_peso: Decimal
