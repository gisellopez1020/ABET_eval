from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, field_validator


def normalizar_codigo_abet(v: Optional[str]) -> Optional[str]:
    """Quita espacios; vacío -> None. La existencia y el nivel se validan en el router (requiere BD)."""
    if v is None:
        return None
    v = v.strip()
    if len(v) > 20:
        raise ValueError("El código ABET admite máximo 20 caracteres")
    return v or None


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
    # Criterio de Evaluación del catálogo ABET (ej. "2.1.1"), opcional
    codigo_abet: Optional[str] = None

    @field_validator("codigo_abet")
    @classmethod
    def validar_codigo_abet(cls, v: Optional[str]) -> Optional[str]:
        return normalizar_codigo_abet(v)


class AspectoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    orden: int
    criterios: List[CriterioOut]
    codigo_abet: Optional[str] = None


class CriteriosPayload(BaseModel):
    """Payload para reemplazar todos los criterios de una actividad."""
    aspectos: List[AspectoIn]


class CriteriosResponse(BaseModel):
    aspectos: List[AspectoOut]
    total_peso: Decimal
    # Con calificaciones la rúbrica no se puede reemplazar; solo cambiar vínculos ABET (PATCH)
    tiene_calificaciones: bool = False


class VinculoAbetIn(BaseModel):
    """Cambia solo el vínculo ABET de un aspecto; null lo desvincula."""
    codigo_abet: Optional[str] = None

    @field_validator("codigo_abet")
    @classmethod
    def validar_codigo_abet(cls, v: Optional[str]) -> Optional[str]:
        return normalizar_codigo_abet(v)
