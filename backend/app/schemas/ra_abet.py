from typing import List, Optional
from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.models.ra_abet_catalogo import PROGRAMA_DEFAULT


def deducir_so(codigo: str) -> str:
    """El SO es la parte del código antes del primer punto: "2.1" -> "2"."""
    return codigo.split(".", 1)[0].strip()


def _texto_requerido(v: str, campo: str, max_len: Optional[int] = None) -> str:
    v = v.strip()
    if not v:
        raise ValueError(f"{campo} no puede estar vacío")
    if max_len is not None and len(v) > max_len:
        raise ValueError(f"{campo} admite máximo {max_len} caracteres")
    return v


class RaAbetCreate(BaseModel):
    codigo: str
    so: Optional[str] = None
    competencia: str
    descripcion: str
    programa: str = PROGRAMA_DEFAULT

    @field_validator("codigo")
    @classmethod
    def validar_codigo(cls, v: str) -> str:
        return _texto_requerido(v, "El código", 20)

    @field_validator("competencia")
    @classmethod
    def validar_competencia(cls, v: str) -> str:
        return _texto_requerido(v, "La competencia", 200)

    @field_validator("descripcion")
    @classmethod
    def validar_descripcion(cls, v: str) -> str:
        return _texto_requerido(v, "La descripción")

    @field_validator("programa")
    @classmethod
    def validar_programa(cls, v: str) -> str:
        return _texto_requerido(v, "El programa", 200)

    @model_validator(mode="after")
    def completar_so(self) -> "RaAbetCreate":
        so = (self.so or "").strip() or deducir_so(self.codigo)
        self.so = _texto_requerido(so, "El SO", 20)
        return self


class RaAbetUpdate(BaseModel):
    """El código no es editable: los cursos lo referencian como texto en ra_abet."""
    so: Optional[str] = None
    competencia: Optional[str] = None
    descripcion: Optional[str] = None
    programa: Optional[str] = None

    @field_validator("so")
    @classmethod
    def validar_so(cls, v: Optional[str]) -> Optional[str]:
        return _texto_requerido(v, "El SO", 20) if v is not None else v

    @field_validator("competencia")
    @classmethod
    def validar_competencia(cls, v: Optional[str]) -> Optional[str]:
        return _texto_requerido(v, "La competencia", 200) if v is not None else v

    @field_validator("descripcion")
    @classmethod
    def validar_descripcion(cls, v: Optional[str]) -> Optional[str]:
        return _texto_requerido(v, "La descripción") if v is not None else v

    @field_validator("programa")
    @classmethod
    def validar_programa(cls, v: Optional[str]) -> Optional[str]:
        return _texto_requerido(v, "El programa", 200) if v is not None else v


class RaAbetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    codigo: str
    so: Optional[str] = None
    competencia: str
    descripcion: str
    programa: str


class RaAbetImportPayload(BaseModel):
    items: List[RaAbetCreate]

    @field_validator("items")
    @classmethod
    def validar_items(cls, v: List[RaAbetCreate]) -> List[RaAbetCreate]:
        if not v:
            raise ValueError("La importación no contiene resultados de aprendizaje")
        vistos: set[str] = set()
        repetidos: List[str] = []
        for item in v:
            if item.codigo in vistos and item.codigo not in repetidos:
                repetidos.append(item.codigo)
            vistos.add(item.codigo)
        if repetidos:
            raise ValueError(f"Códigos repetidos en la importación: {', '.join(repetidos)}")
        return v


class RaAbetImportResultado(BaseModel):
    creados: int
    actualizados: int
