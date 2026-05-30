from pydantic import BaseModel, ConfigDict


class SeccionCreate(BaseModel):
    nombre: str


class SeccionUpdate(BaseModel):
    nombre: str


class SeccionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    curso_id: int
    activo: bool
    total_estudiantes: int = 0
