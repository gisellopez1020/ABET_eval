from typing import List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.schemas import ActividadRecienteItem, CursoCreate, CursoUpdate, CursoOut
from app.services.cursos import CursoService

# Los errores de negocio (404, 403, 422) los lanza CursoService y los traduce
# a HTTP el manejador global registrado en main.py (app/errores_http.py)
router = APIRouter(prefix="/cursos", tags=["Cursos"])


@router.get("", response_model=List[CursoOut], summary="Listar cursos del docente")
def listar_cursos(
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Devuelve todos los cursos (activos e inactivos) del docente autenticado."""
    return CursoService(db).listar(usuario["email"])


@router.post("", response_model=CursoOut, status_code=status.HTTP_201_CREATED, summary="Crear curso")
def crear_curso(
    body: CursoCreate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Crea un nuevo curso asociado al docente autenticado.
    422 si algún código de ra_abet no existe en el catálogo o es un Criterio.
    """
    return CursoService(db).crear(usuario["email"], body.model_dump())


@router.get("/{curso_id}", response_model=CursoOut, summary="Detalle de curso")
def obtener_curso(
    curso_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Devuelve el detalle de un curso específico del docente.
    404 si el curso no existe, 403 si es de otro docente.
    """
    return CursoService(db).obtener(curso_id, usuario["email"])


@router.get(
    "/{curso_id}/actividad-reciente",
    response_model=List[ActividadRecienteItem],
    summary="Últimas calificaciones guardadas del curso",
)
def actividad_reciente(
    curso_id: int,
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Últimos guardados o ediciones de calificaciones del curso, del más reciente
    al más antiguo, agrupados por (actividad, equipo o estudiante).
    404 si el curso no existe, 403 si es de otro docente.
    """
    return CursoService(db).actividad_reciente(curso_id, usuario["email"], limit)


@router.put("/{curso_id}", response_model=CursoOut, summary="Editar curso")
def editar_curso(
    curso_id: int,
    body: CursoUpdate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Actualiza los campos del curso. Solo campos enviados son modificados.
    404 si el curso no existe, 403 si es de otro docente, 422 si el ra_abet
    enviado tiene códigos que no existen en el catálogo o son Criterios.
    """
    return CursoService(db).editar(curso_id, usuario["email"], body.model_dump(exclude_none=True))


@router.patch("/{curso_id}/archivar", response_model=CursoOut, summary="Archivar curso")
def archivar_curso(
    curso_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Marca el curso como inactivo (archivado). No elimina datos.
    404 si el curso no existe, 403 si es de otro docente.
    """
    return CursoService(db).archivar(curso_id, usuario["email"])


@router.patch("/{curso_id}/activar", response_model=CursoOut, summary="Reactivar curso")
def activar_curso(
    curso_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Marca el curso como activo nuevamente (revierte el archivado).
    404 si el curso no existe, 403 si es de otro docente.
    """
    return CursoService(db).activar(curso_id, usuario["email"])
