from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import Seccion
from app.schemas import SeccionCreate, SeccionUpdate, SeccionOut
from app.services.secciones import SeccionService

# Los errores de negocio (404, 403, 409) los lanza SeccionService y los traduce
# a HTTP el manejador global registrado en main.py (app/errores_http.py)
router = APIRouter(tags=["Secciones"])


def _seccion_con_total(seccion: Seccion) -> SeccionOut:
    out = SeccionOut.model_validate(seccion)
    out.total_estudiantes = len(seccion.estudiantes)
    return out


@router.get(
    "/cursos/{curso_id}/secciones",
    response_model=List[SeccionOut],
    summary="Listar secciones del curso",
)
def listar_secciones(
    curso_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Devuelve las secciones activas del curso con su conteo de estudiantes.
    404 si el curso no existe, 403 si es de otro docente.
    """
    secciones = SeccionService(db).listar(curso_id, usuario["email"])
    return [_seccion_con_total(s) for s in secciones]


@router.post(
    "/cursos/{curso_id}/secciones",
    response_model=SeccionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear sección",
)
def crear_seccion(
    curso_id: int,
    body: SeccionCreate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Crea una nueva sección (grupo) dentro del curso.
    404 si el curso no existe, 403 si es de otro docente.
    """
    seccion = SeccionService(db).crear(curso_id, usuario["email"], body.nombre)
    return _seccion_con_total(seccion)


@router.put("/secciones/{seccion_id}", response_model=SeccionOut, summary="Editar sección")
def editar_seccion(
    seccion_id: int,
    body: SeccionUpdate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Renombra una sección existente.
    404 si la sección (o su curso) no existe, 403 si es de otro docente.
    """
    seccion = SeccionService(db).renombrar(seccion_id, usuario["email"], body.nombre)
    return _seccion_con_total(seccion)


@router.delete(
    "/secciones/{seccion_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar sección",
)
def eliminar_seccion(
    seccion_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Elimina una sección solo si no tiene estudiantes registrados.
    409 si tiene estudiantes, 404 si la sección (o su curso) no existe,
    403 si es de otro docente.
    """
    SeccionService(db).eliminar(seccion_id, usuario["email"])
