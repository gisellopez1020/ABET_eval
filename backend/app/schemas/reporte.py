from typing import Dict, List, Optional
from pydantic import BaseModel


class RangoReporte(BaseModel):
    """Rango de clasificación del curso (curso.rangos_calificacion), en orden por mínimo."""
    etiqueta: str
    minimo: float
    maximo: float


class ReporteCriterioItem(BaseModel):
    """Distribución de estudiantes para un Criterio ABET (ej. "2.1.1")."""
    codigo: str
    descripcion: str
    codigo_padre: Optional[str]
    peso: Optional[float]
    rangos: Dict[str, int]    # {etiqueta: cantidad de estudiantes}
    sin_clasificar: int       # notas que caen en un hueco entre rangos
    total: int


class ReporteRAItem(BaseModel):
    """Distribución de estudiantes para un Resultado de Aprendizaje (ej. "2.1")."""
    codigo: str
    descripcion: str
    rangos: Dict[str, int]
    sin_clasificar: int
    total: int
    # Criterios del RA vinculados a algún aspecto del curso (entran al promedio)
    criterios_con_evidencia: List[str]
    # Criterios del RA sin vincular (excluidos; el promedio se renormaliza)
    criterios_sin_evidencia: List[str]


class ReporteABETResponse(BaseModel):
    curso_id: int
    curso_nombre: str
    curso_codigo: str
    periodo: str
    docente_email: str
    rangos: List[RangoReporte]
    criterios: List[ReporteCriterioItem]
    resultados: List[ReporteRAItem]
