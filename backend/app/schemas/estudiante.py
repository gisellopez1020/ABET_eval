from typing import List, Optional
from pydantic import BaseModel, ConfigDict, field_validator


class EstudianteCreate(BaseModel):
    nombre_completo: str
    codigo_estudiante: str
    # Opcional. Su formato no bloquea el alta: ver agregar_estudiante()
    email: Optional[str] = None


class EstudianteUpdate(BaseModel):
    """Solo se cambia lo que venga en el body. La sección no se edita (los equipos dependen de ella)."""
    nombre_completo: Optional[str] = None
    codigo_estudiante: Optional[str] = None
    # null o vacío borra el correo; si no se envía, no se toca
    email: Optional[str] = None

    @field_validator("nombre_completo", "codigo_estudiante")
    @classmethod
    def no_vacio(cls, v: Optional[str]) -> str:
        if v is None or not v.strip():
            raise ValueError("No puede quedar vacío")
        return v.strip()


class EstudianteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre_completo: str
    codigo_estudiante: str
    seccion_id: int
    email: Optional[str] = None


class EstudianteCreado(EstudianteOut):
    """Respuesta del alta manual y de la edición: `aviso` explica qué pasó con un correo no válido."""
    aviso: Optional[str] = None


class EstudianteListadoOut(EstudianteOut):
    """Listado de una sección: incluye el promedio ponderado (None si no hay actividades calificadas)."""
    promedio: Optional[float] = None


class ImportacionCSVResultado(BaseModel):
    importados: int
    errores: List[str] = []


class EstudianteLeido(BaseModel):
    nombre: str
    codigo: str
    email: Optional[str] = None


class VistaPreviaEstudiantes(BaseModel):
    """Lo que importaría el archivo, sin guardarlo."""
    estudiantes: List[EstudianteLeido]
    errores: List[str] = []
