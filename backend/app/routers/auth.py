from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Autenticación"])


class TokenRequest(BaseModel):
    access_token: str


class DocenteOut(BaseModel):
    email: str
    nombre: str


@router.get("/me", response_model=DocenteOut, summary="Datos del docente autenticado")
def get_me(usuario: dict = Depends(get_current_user)):
    """Devuelve el email y nombre del docente autenticado a partir del JWT de Microsoft."""
    return DocenteOut(email=usuario["email"], nombre=usuario["nombre"])


@router.post("/token", response_model=DocenteOut, summary="Validar token Microsoft")
def validate_token(
    body: TokenRequest,
    usuario: dict = Depends(get_current_user),
):
    """
    Recibe el access_token de Microsoft, lo valida y devuelve los datos del docente.
    El middleware de autenticación realiza la validación real del JWT.
    """
    return DocenteOut(email=usuario["email"], nombre=usuario["nombre"])
