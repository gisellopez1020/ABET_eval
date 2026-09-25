from typing import List, Optional
from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.models.ra_abet_catalogo import PROGRAMA_DEFAULT


def deducir_so(codigo: str) -> str:
    """El SO es la parte del código antes del primer punto: "2.1" -> "2", "2.1.1" -> "2"."""
    return codigo.split(".", 1)[0].strip()


def _texto_requerido(v: str, campo: str, max_len: Optional[int] = None) -> str:
    v = v.strip()
    if not v:
        raise ValueError(f"{campo} no puede estar vacío")
    if max_len is not None and len(v) > max_len:
        raise ValueError(f"{campo} admite máximo {max_len} caracteres")
    return v


def _texto_opcional(v: Optional[str]) -> Optional[str]:
    """Cadena vacía o solo espacios -> None."""
    if v is None:
        return None
    v = v.strip()
    return v or None


def _validar_padre_peso(codigo_padre: Optional[str], peso: Optional[float]) -> None:
    """codigo_padre y peso van juntos: ambos (Criterio) o ninguno (Resultado de Aprendizaje)."""
    if (codigo_padre is None) != (peso is None):
        raise ValueError(
            "codigo_padre y peso deben enviarse juntos: un Criterio necesita ambos "
            "y un Resultado de Aprendizaje ninguno"
        )
    if peso is not None and not (0 < peso <= 1):
        raise ValueError("El peso de un Criterio debe ser mayor que 0 y como máximo 1")


class RaAbetCreate(BaseModel):
    """
    Resultado de Aprendizaje (sin codigo_padre ni peso) o Criterio de Evaluación
    (con ambos). La existencia y el nivel del padre se validan en el router (requiere BD).
    """
    codigo: str
    so: Optional[str] = None
    # Obligatoria en un RA; en un Criterio, si viene vacía, el router usa la de su padre
    competencia: Optional[str] = None
    descripcion: str
    programa: str = PROGRAMA_DEFAULT
    codigo_padre: Optional[str] = None
    peso: Optional[float] = None

    @field_validator("codigo")
    @classmethod
    def validar_codigo(cls, v: str) -> str:
        return _texto_requerido(v, "El código", 20)

    @field_validator("competencia")
    @classmethod
    def validar_competencia(cls, v: Optional[str]) -> Optional[str]:
        return _texto_opcional(v)

    @field_validator("descripcion")
    @classmethod
    def validar_descripcion(cls, v: str) -> str:
        return _texto_requerido(v, "La descripción")

    @field_validator("programa")
    @classmethod
    def validar_programa(cls, v: str) -> str:
        return _texto_requerido(v, "El programa", 200)

    @field_validator("codigo_padre")
    @classmethod
    def validar_codigo_padre(cls, v: Optional[str]) -> Optional[str]:
        v = _texto_opcional(v)
        if v is not None and len(v) > 20:
            raise ValueError("El código padre admite máximo 20 caracteres")
        return v

    @model_validator(mode="after")
    def validar_nivel(self) -> "RaAbetCreate":
        _validar_padre_peso(self.codigo_padre, self.peso)
        if self.codigo_padre == self.codigo:
            raise ValueError("Un código no puede ser su propio padre")
        if self.codigo_padre is None and self.competencia is None:
            raise ValueError("La competencia no puede estar vacía en un Resultado de Aprendizaje")
        so = (self.so or "").strip() or deducir_so(self.codigo)
        self.so = _texto_requerido(so, "El SO", 20)
        return self


class RaAbetUpdate(BaseModel):
    """
    El código no es editable (los cursos lo referencian). codigo_padre y peso se
    envían juntos; el router no permite cambiar de nivel (RA <-> Criterio).
    """
    so: Optional[str] = None
    competencia: Optional[str] = None
    descripcion: Optional[str] = None
    programa: Optional[str] = None
    codigo_padre: Optional[str] = None
    peso: Optional[float] = None

    @field_validator("so")
    @classmethod
    def validar_so(cls, v: Optional[str]) -> Optional[str]:
        return _texto_requerido(v, "El SO", 20) if v is not None else v

    @field_validator("competencia")
    @classmethod
    def validar_competencia(cls, v: Optional[str]) -> Optional[str]:
        return _texto_requerido(v, "La competencia") if v is not None else v

    @field_validator("descripcion")
    @classmethod
    def validar_descripcion(cls, v: Optional[str]) -> Optional[str]:
        return _texto_requerido(v, "La descripción") if v is not None else v

    @field_validator("programa")
    @classmethod
    def validar_programa(cls, v: Optional[str]) -> Optional[str]:
        return _texto_requerido(v, "El programa", 200) if v is not None else v

    @field_validator("codigo_padre")
    @classmethod
    def validar_codigo_padre(cls, v: Optional[str]) -> Optional[str]:
        return _texto_requerido(v, "El código padre", 20) if v is not None else v

    @model_validator(mode="after")
    def validar_campos(self) -> "RaAbetUpdate":
        enviados = self.model_fields_set
        # Estos campos son NOT NULL en la BD: enviarlos explícitamente en null no tiene sentido
        for campo in ("so", "competencia", "descripcion", "programa"):
            if campo in enviados and getattr(self, campo) is None:
                raise ValueError(f"'{campo}' no puede ser null")
        if ("codigo_padre" in enviados) != ("peso" in enviados):
            raise ValueError("codigo_padre y peso deben enviarse juntos")
        if "codigo_padre" in enviados:
            _validar_padre_peso(self.codigo_padre, self.peso)
        return self


class RaAbetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    codigo: str
    so: Optional[str] = None
    competencia: str
    descripcion: str
    programa: str
    codigo_padre: Optional[str] = None
    peso: Optional[float] = None


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
