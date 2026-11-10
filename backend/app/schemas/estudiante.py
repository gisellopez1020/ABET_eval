from typing import List, Literal, Optional
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
    # Filas que no se importaron por tener un código ya presente en la sección o repetido en el archivo
    omitidos: int = 0


class EstudianteLeido(BaseModel):
    nombre: str
    codigo: str
    email: Optional[str] = None


class EstudianteOmitido(BaseModel):
    """
    Fila que la importación no guardaría: su código ya está en la sección ("en_seccion")
    o en una fila anterior del archivo ("en_archivo"). `nombre` y `codigo` son los de la
    fila descartada; `nombre_conservado` el del estudiante que se queda (el guardado, o
    el de `fila_conservada` del archivo).
    """
    fila: int
    nombre: str
    codigo: str
    motivo: Literal["en_seccion", "en_archivo"]
    nombre_conservado: str
    fila_conservada: Optional[int] = None


class VistaPreviaEstudiantes(BaseModel):
    """Lo que importaría el archivo, sin guardarlo: `estudiantes` ya sin los `omitidos`."""
    estudiantes: List[EstudianteLeido]
    errores: List[str] = []
    omitidos: List[EstudianteOmitido] = []
