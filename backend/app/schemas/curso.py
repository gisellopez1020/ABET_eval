from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, field_validator


class CursoCreate(BaseModel):
    nombre: str
    codigo: str
    periodo: str
    ra_abet: List[str] = []

    @field_validator("ra_abet")
    @classmethod
    def validar_ra_abet(cls, v: List[str]) -> List[str]:
        if len(v) > 10:
            raise ValueError("Máximo 10 resultados de aprendizaje ABET permitidos")
        return v


class CursoUpdate(BaseModel):
    nombre: Optional[str] = None
    codigo: Optional[str] = None
    periodo: Optional[str] = None
    ra_abet: Optional[List[str]] = None

    @field_validator("ra_abet")
    @classmethod
    def validar_ra_abet(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is not None and len(v) > 10:
            raise ValueError("Máximo 10 resultados de aprendizaje ABET permitidos")
        return v


class CursoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    codigo: str
    periodo: str
    docente_email: str
    ra_abet: List[str] = []
    activo: bool
    created_at: datetime
