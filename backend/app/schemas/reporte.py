from typing import Dict
from pydantic import BaseModel


class RangoDistribucion(BaseModel):
    rango_bajo: int    # 0.0 – 2.9
    rango_medio: int   # 3.0 – 3.9
    rango_alto: int    # 4.0 – 5.0
    total: int


class ReporteRAItem(BaseModel):
    ra: str
    rangos: Dict[str, int]   # {"0.0-2.9": 5, "3.0-3.9": 12, "4.0-5.0": 8}
    total: int


class ReporteABETResponse(BaseModel):
    curso_id: int
    curso_nombre: str
    curso_codigo: str
    periodo: str
    docente_email: str
    resultados: list[ReporteRAItem]
