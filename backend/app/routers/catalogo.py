from typing import List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.schemas import (
    RaAbetCreate, RaAbetUpdate, RaAbetOut, RaAbetImportPayload, RaAbetImportResultado,
)
from app.services.catalogo import CatalogoService

# Catálogo global del programa: lo comparten todos los docentes (sin verificación de
# propiedad; get_current_user solo exige estar autenticado). Los errores de negocio
# (404, 409, 422) los lanza CatalogoService y los traduce a HTTP el manejador global
# registrado en main.py (app/errores_http.py)
router = APIRouter(prefix="/catalogo/ra-abet", tags=["Catálogo RA ABET"])


@router.get("", response_model=List[RaAbetOut], summary="Listar el catálogo de RA ABET")
def listar_ra_abet(
    solo_raiz: bool = Query(default=False, description="Solo Resultados de Aprendizaje (sin Criterios)"),
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Devuelve el catálogo ordenado por código; con `solo_raiz=true`, solo el nivel superior."""
    return CatalogoService(db).listar(solo_raiz)


@router.post(
    "",
    response_model=RaAbetOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear Resultado de Aprendizaje o Criterio",
)
def crear_ra_abet(
    body: RaAbetCreate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Crea un código nuevo. Si no se envía `so`, se deduce del código ("2.1" -> "2").
    Un Criterio (con `codigo_padre` y `peso`) sin competencia hereda la de su RA.
    409 si el código ya existe; 422 si el RA padre no existe o es un Criterio.
    """
    return CatalogoService(db).crear(body.model_dump())


@router.post(
    "/importar",
    response_model=RaAbetImportResultado,
    summary="Importar Resultados de Aprendizaje y Criterios (crear o actualizar)",
)
def importar_ra_abet(
    body: RaAbetImportPayload,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Crea los códigos nuevos y actualiza los existentes en una sola transacción:
    si algo falla no se guarda nada. Primero procesa los Resultados de Aprendizaje
    y luego los Criterios, sin importar el orden del archivo. Los pesos no tienen
    que sumar 1.0.
    422 con todos los motivos si algún código cambiaría de nivel o su RA padre no
    existe o es un Criterio.
    """
    return CatalogoService(db).importar(body.items)


@router.put("/{codigo}", response_model=RaAbetOut, summary="Editar Resultado de Aprendizaje o Criterio")
def editar_ra_abet(
    codigo: str,
    body: RaAbetUpdate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Actualiza los campos enviados. El código no es editable y no se puede cambiar
    de nivel; un Criterio sí puede cambiar de peso o moverse a otro RA.
    404 si el código no existe; 422 si cambiaría de nivel o el nuevo RA padre no
    existe o es un Criterio.
    """
    return CatalogoService(db).editar(codigo, body.model_dump(exclude_unset=True))


@router.delete(
    "/{codigo}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar Resultado de Aprendizaje o Criterio",
)
def eliminar_ra_abet(
    codigo: str,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Elimina el código solo si no tiene Criterios hijos, ningún curso lo tiene en su
    ra_abet y ningún aspecto de rúbrica está vinculado a él (409 si no).
    404 si el código no existe.
    """
    CatalogoService(db).eliminar(codigo)
