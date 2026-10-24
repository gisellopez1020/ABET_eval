from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel


class AspectoRetroalimentacion(BaseModel):
    """Retroalimentación estructurada de un aspecto: texto de sus criterios cumplidos y no cumplidos."""
    aspecto_id: int
    nombre: str
    cumplidos: List[str]
    por_reforzar: List[str]


class RetroalimentacionOut(BaseModel):
    # False si falta calificar algún criterio: entonces no se redacta con IA
    completa: bool
    # "ia": `texto` trae el párrafo redactado; "estructurada": solo `aspectos`
    fuente: Literal["ia", "estructurada"]
    texto: Optional[str] = None
    aspectos: List[AspectoRetroalimentacion]
    generada_en: Optional[datetime] = None
