from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict
from app.schemas.estudiante import EstudianteOut


class EquipoCreate(BaseModel):
    nombre: str
    estudiante_ids: List[int]


class EquiposPayload(BaseModel):
    equipos: List[EquipoCreate]


class EquipoUpdate(BaseModel):
    nombre: Optional[str] = None
    estudiante_ids: Optional[List[int]] = None


class EquipoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    actividad_id: int
    seccion_id: int
    miembros: List[EstudianteOut] = []
    calificado: bool = False
    nota_total: Optional[Decimal] = None


class ModoCalificacionItem(BaseModel):
    """Unidad a calificar: puede ser equipo o estudiante."""
    id: int
    nombre: str
    miembros: List[EstudianteOut] = []
    calificado: bool = False
    nota_total: Optional[Decimal] = None


class ModoCalificacionResponse(BaseModel):
    tipo: str  # 'individual' | 'grupal'
    items: List[ModoCalificacionItem]
    total: int
    calificados: int
