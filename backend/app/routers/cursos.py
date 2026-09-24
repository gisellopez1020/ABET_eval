from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import Curso, RaAbetCatalogo
from app.schemas import CursoCreate, CursoUpdate, CursoOut

router = APIRouter(prefix="/cursos", tags=["Cursos"])


def _verificar_propietario(curso: Curso, email: str) -> None:
    if curso.docente_email != email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permiso para acceder a este curso",
        )


def _validar_ra_abet(codigos: List[str], db: Session) -> None:
    """Cada código de ra_abet debe existir en ra_abet_catalogo (no se puede validar en el schema: requiere BD)."""
    if not codigos:
        return
    existentes = {
        codigo
        for (codigo,) in db.query(RaAbetCatalogo.codigo).filter(RaAbetCatalogo.codigo.in_(codigos))
    }
    desconocidos = [c for c in codigos if c not in existentes]
    if desconocidos:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Códigos RA ABET que no existen en el catálogo: {', '.join(desconocidos)}",
        )


@router.get("", response_model=List[CursoOut], summary="Listar cursos del docente")
def listar_cursos(
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Devuelve todos los cursos (activos e inactivos) del docente autenticado."""
    return db.query(Curso).filter(Curso.docente_email == usuario["email"]).all()


@router.post("", response_model=CursoOut, status_code=status.HTTP_201_CREATED, summary="Crear curso")
def crear_curso(
    body: CursoCreate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Crea un nuevo curso asociado al docente autenticado."""
    _validar_ra_abet(body.ra_abet, db)
    curso = Curso(**body.model_dump(), docente_email=usuario["email"])
    db.add(curso)
    db.commit()
    db.refresh(curso)
    return curso


@router.get("/{curso_id}", response_model=CursoOut, summary="Detalle de curso")
def obtener_curso(
    curso_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Devuelve el detalle de un curso específico del docente."""
    curso = db.get(Curso, curso_id)
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    _verificar_propietario(curso, usuario["email"])
    return curso


@router.put("/{curso_id}", response_model=CursoOut, summary="Editar curso")
def editar_curso(
    curso_id: int,
    body: CursoUpdate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Actualiza los campos del curso. Solo campos enviados son modificados."""
    curso = db.get(Curso, curso_id)
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    _verificar_propietario(curso, usuario["email"])
    if body.ra_abet is not None:
        _validar_ra_abet(body.ra_abet, db)

    for campo, valor in body.model_dump(exclude_none=True).items():
        setattr(curso, campo, valor)

    db.commit()
    db.refresh(curso)
    return curso


@router.patch("/{curso_id}/archivar", response_model=CursoOut, summary="Archivar curso")
def archivar_curso(
    curso_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Marca el curso como inactivo (archivado). No elimina datos."""
    curso = db.get(Curso, curso_id)
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    _verificar_propietario(curso, usuario["email"])

    curso.activo = False
    db.commit()
    db.refresh(curso)
    return curso
