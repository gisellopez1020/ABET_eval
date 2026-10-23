from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, field_validator, model_validator
from app.models.actividad import TipoActividad
from app.schemas.criterio import AspectoOut


def _validar_alcance(aplica_todas: Optional[bool], secciones_ids: Optional[List[int]]) -> Optional[List[int]]:
    """
    "Todas las secciones" y "secciones específicas" son estados distintos: no se infiere
    "todas" de una lista vacía. Devuelve secciones_ids sin repetidos (en su orden).
    """
    if aplica_todas is False and not secciones_ids:
        raise ValueError("Elija al menos una sección o aplique la actividad a todas las secciones")
    if secciones_ids and aplica_todas is not False:
        raise ValueError("secciones_ids solo se envía con aplica_todas_secciones en false")
    return list(dict.fromkeys(secciones_ids)) if secciones_ids is not None else None


class ActividadCreate(BaseModel):
    nombre: str
    tipo: TipoActividad
    peso_nota_final: Decimal
    # True: aplica a todas las secciones del curso, también a las que se creen después
    aplica_todas_secciones: bool = True
    secciones_ids: List[int] = []

    @field_validator("peso_nota_final")
    @classmethod
    def validar_peso(cls, v: Decimal) -> Decimal:
        if v <= 0 or v > 100:
            raise ValueError("El peso en nota final debe estar entre 0.01 y 100")
        return v

    @model_validator(mode="after")
    def validar_alcance(self) -> "ActividadCreate":
        self.secciones_ids = _validar_alcance(self.aplica_todas_secciones, self.secciones_ids)
        return self


class ActividadUpdate(BaseModel):
    nombre: Optional[str] = None
    peso_nota_final: Optional[Decimal] = None
    # El alcance se envía completo: true, o false con las secciones que quedan
    aplica_todas_secciones: Optional[bool] = None
    secciones_ids: Optional[List[int]] = None

    @field_validator("peso_nota_final")
    @classmethod
    def validar_peso(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and (v <= 0 or v > 100):
            raise ValueError("El peso en nota final debe estar entre 0.01 y 100")
        return v

    @model_validator(mode="after")
    def validar_alcance(self) -> "ActividadUpdate":
        self.secciones_ids = _validar_alcance(self.aplica_todas_secciones, self.secciones_ids)
        return self


class ActividadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    tipo: TipoActividad
    peso_nota_final: Decimal
    curso_id: int
    created_at: datetime
    # Suma de pesos de los criterios de la rúbrica (0 si no hay criterios)
    total_peso_criterios: Decimal = Decimal("0")
    # Alcance: con aplica_todas_secciones, secciones_ids va vacío
    aplica_todas_secciones: bool = True
    secciones_ids: List[int] = []


class ActividadDetalleOut(ActividadOut):
    """Actividad con su rúbrica anidada (GET /actividades/{id})."""
    aspectos: List[AspectoOut] = []
