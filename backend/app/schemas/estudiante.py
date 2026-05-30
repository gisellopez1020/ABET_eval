from typing import List
from pydantic import BaseModel, ConfigDict


class EstudianteCreate(BaseModel):
    nombre_completo: str
    codigo_estudiante: str


class EstudianteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre_completo: str
    codigo_estudiante: str
    seccion_id: int


class ImportacionCSVResultado(BaseModel):
    importados: int
    errores: List[str] = []
