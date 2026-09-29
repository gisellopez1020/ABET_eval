from typing import List, Optional
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


class EstudianteListadoOut(EstudianteOut):
    """Listado de una sección: incluye el promedio ponderado (None si no hay actividades calificadas)."""
    promedio: Optional[float] = None


class ImportacionCSVResultado(BaseModel):
    importados: int
    errores: List[str] = []


class EstudianteLeido(BaseModel):
    nombre: str
    codigo: str


class VistaPreviaEstudiantes(BaseModel):
    """Lo que importaría el archivo, sin guardarlo."""
    estudiantes: List[EstudianteLeido]
    errores: List[str] = []
