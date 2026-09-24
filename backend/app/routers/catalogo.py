from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import Curso, RaAbetCatalogo
from app.schemas import (
    RaAbetCreate, RaAbetUpdate, RaAbetOut, RaAbetImportPayload, RaAbetImportResultado,
)

# Catálogo global del programa: lo comparten todos los docentes.
router = APIRouter(prefix="/catalogo/ra-abet", tags=["Catálogo RA ABET"])


def _cursos_que_usan(codigo: str, db: Session) -> int:
    """
    Cuenta los cursos (de cualquier docente) cuyo ra_abet contiene el código.
    Se revisa en Python en vez de con operadores jsonb para que sea portable;
    el volumen de cursos es pequeño.
    """
    return sum(1 for (ra_abet,) in db.query(Curso.ra_abet).all() if codigo in (ra_abet or []))


def _obtener(codigo: str, db: Session) -> RaAbetCatalogo:
    ra = db.get(RaAbetCatalogo, codigo)
    if not ra:
        raise HTTPException(status_code=404, detail=f"El código '{codigo}' no existe en el catálogo")
    return ra


@router.get("", response_model=List[RaAbetOut], summary="Listar el catálogo de RA ABET")
def listar_ra_abet(
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Devuelve todos los resultados de aprendizaje del catálogo, ordenados por código."""
    return db.query(RaAbetCatalogo).order_by(RaAbetCatalogo.codigo).all()


@router.post(
    "",
    response_model=RaAbetOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear resultado de aprendizaje",
)
def crear_ra_abet(
    body: RaAbetCreate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Crea un código nuevo. Si no se envía `so`, se deduce del código ("2.1" -> "2")."""
    if db.get(RaAbetCatalogo, body.codigo):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"El código '{body.codigo}' ya existe en el catálogo",
        )
    ra = RaAbetCatalogo(**body.model_dump())
    db.add(ra)
    db.commit()
    db.refresh(ra)
    return ra


@router.post(
    "/importar",
    response_model=RaAbetImportResultado,
    summary="Importar resultados de aprendizaje (crear o actualizar)",
)
def importar_ra_abet(
    body: RaAbetImportPayload,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Crea los códigos nuevos y actualiza los existentes en una sola transacción:
    si algo falla no se guarda nada.
    """
    creados = actualizados = 0
    try:
        for item in body.items:
            existente = db.get(RaAbetCatalogo, item.codigo)
            if existente:
                # Solo los campos enviados: no pisar p. ej. el programa con su valor por defecto
                for campo, valor in item.model_dump(exclude={"codigo"}, exclude_unset=True).items():
                    setattr(existente, campo, valor)
                actualizados += 1
            else:
                db.add(RaAbetCatalogo(**item.model_dump()))
                creados += 1
        db.commit()
    except Exception:
        db.rollback()
        raise
    return RaAbetImportResultado(creados=creados, actualizados=actualizados)


@router.put("/{codigo}", response_model=RaAbetOut, summary="Editar resultado de aprendizaje")
def editar_ra_abet(
    codigo: str,
    body: RaAbetUpdate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Actualiza los campos enviados. El código no es editable."""
    ra = _obtener(codigo, db)
    for campo, valor in body.model_dump(exclude_none=True).items():
        setattr(ra, campo, valor)
    db.commit()
    db.refresh(ra)
    return ra


@router.delete(
    "/{codigo}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar resultado de aprendizaje",
)
def eliminar_ra_abet(
    codigo: str,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Elimina el código solo si ningún curso lo tiene en su ra_abet."""
    ra = _obtener(codigo, db)
    en_uso = _cursos_que_usan(codigo, db)
    if en_uso:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No se puede eliminar '{codigo}' porque está en uso por "
                   f"{en_uso} curso{'s' if en_uso != 1 else ''}.",
        )
    db.delete(ra)
    db.commit()
