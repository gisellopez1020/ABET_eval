from typing import Dict, List, Literal, Optional
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


class ReporteActividadResponse(ReporteABETResponse):
    """Los mismos dos niveles, acotados a los aspectos vinculados de una actividad."""
    actividad_id: int
    actividad_nombre: str
    actividad_tipo: str   # "individual" | "grupal"


class DetalleXlsxRequest(BaseModel):
    seccion_id: Optional[int] = None


class EstadoDrive(BaseModel):
    estado: Literal["sincronizado", "simulado", "error"]
    detalle: Optional[str] = None   # motivo del error
    enlace: Optional[str] = None    # webViewLink del archivo en Drive


class DetalleXlsxResponse(BaseModel):
    """El archivo viaja siempre, aunque falle la sincronización con Drive."""
    nombre_archivo: str
    archivo_base64: str
    drive: EstadoDrive
