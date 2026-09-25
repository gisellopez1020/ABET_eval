from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import Aspecto, Curso, RaAbetCatalogo
from app.schemas import (
    RaAbetCreate, RaAbetUpdate, RaAbetOut, RaAbetImportPayload, RaAbetImportResultado,
)

# Catálogo global del programa: lo comparten todos los docentes.
# Dos niveles: Resultado de Aprendizaje (codigo_padre NULL) y Criterio (codigo_padre -> RA).
# Los pesos de los Criterios de un RA no tienen que sumar 1.0 (solo es una advertencia en el frontend).
router = APIRouter(prefix="/catalogo/ra-abet", tags=["Catálogo RA ABET"])


def _cursos_que_usan(codigo: str, db: Session) -> int:
    """
    Cuenta los cursos (de cualquier docente) cuyo ra_abet contiene el código.
    Se revisa en Python en vez de con operadores jsonb para que sea portable;
    el volumen de cursos es pequeño.
    """
    return sum(1 for (ra_abet,) in db.query(Curso.ra_abet).all() if codigo in (ra_abet or []))


def _aspectos_que_usan(codigo: str, db: Session) -> int:
    """Aspectos de rúbrica (de cualquier docente) vinculados al código."""
    return db.query(Aspecto).filter(Aspecto.codigo_abet == codigo).count()


def _contar_hijos(codigo: str, db: Session) -> int:
    return db.query(RaAbetCatalogo).filter(RaAbetCatalogo.codigo_padre == codigo).count()


def _obtener(codigo: str, db: Session) -> RaAbetCatalogo:
    ra = db.get(RaAbetCatalogo, codigo)
    if not ra:
        raise HTTPException(status_code=404, detail=f"El código '{codigo}' no existe en el catálogo")
    return ra


def _validar_padre(codigo_padre: str, db: Session) -> RaAbetCatalogo:
    """El padre debe existir y ser un Resultado de Aprendizaje (solo 2 niveles, nunca 3)."""
    padre = db.get(RaAbetCatalogo, codigo_padre)
    if not padre:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"El RA padre '{codigo_padre}' no existe en el catálogo",
        )
    if padre.codigo_padre is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"'{codigo_padre}' es un Criterio y no puede tener Criterios hijos "
                   "(solo se permiten 2 niveles)",
        )
    return padre


def _error_cambio_nivel(codigo: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"'{codigo}' no puede cambiar de nivel (Resultado de Aprendizaje <-> Criterio); "
               "elimínelo y créelo de nuevo",
    )


@router.get("", response_model=List[RaAbetOut], summary="Listar el catálogo de RA ABET")
def listar_ra_abet(
    solo_raiz: bool = Query(default=False, description="Solo Resultados de Aprendizaje (sin Criterios)"),
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Devuelve el catálogo ordenado por código; con `solo_raiz=true`, solo el nivel superior."""
    query = db.query(RaAbetCatalogo)
    if solo_raiz:
        query = query.filter(RaAbetCatalogo.codigo_padre.is_(None))
    return query.order_by(RaAbetCatalogo.codigo).all()


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
    """
    if db.get(RaAbetCatalogo, body.codigo):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"El código '{body.codigo}' ya existe en el catálogo",
        )
    datos = body.model_dump()
    if body.codigo_padre is not None:
        padre = _validar_padre(body.codigo_padre, db)
        datos["competencia"] = body.competencia or padre.competencia
    ra = RaAbetCatalogo(**datos)
    db.add(ra)
    db.commit()
    db.refresh(ra)
    return ra


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
    """
    existentes: Dict[str, RaAbetCatalogo] = {ra.codigo: ra for ra in db.query(RaAbetCatalogo).all()}
    archivo = {item.codigo: item for item in body.items}

    def padre_final(codigo: str) -> Optional[str]:
        """Nivel de un código tras la importación: el del archivo si viene, si no el de la BD."""
        return archivo[codigo].codigo_padre if codigo in archivo else existentes[codigo].codigo_padre

    def competencia_final(codigo: str) -> str:
        if codigo in archivo and archivo[codigo].competencia:
            return archivo[codigo].competencia
        return existentes[codigo].competencia

    # Validar el estado final completo antes de escribir nada
    errores: List[str] = []
    for item in body.items:
        existente = existentes.get(item.codigo)
        if existente and (existente.codigo_padre is None) != (item.codigo_padre is None):
            errores.append(f"'{item.codigo}' cambiaría de nivel (Resultado de Aprendizaje <-> Criterio)")
        if item.codigo_padre is not None:
            if item.codigo_padre not in archivo and item.codigo_padre not in existentes:
                errores.append(f"el RA padre '{item.codigo_padre}' de '{item.codigo}' no existe")
            elif padre_final(item.codigo_padre) is not None:
                errores.append(
                    f"el padre '{item.codigo_padre}' de '{item.codigo}' es un Criterio "
                    "(solo se permiten 2 niveles)"
                )
    if errores:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No se importó nada: " + "; ".join(errores),
        )

    raices = [item for item in body.items if item.codigo_padre is None]
    criterios = [item for item in body.items if item.codigo_padre is not None]
    creados = actualizados = 0
    try:
        for grupo in (raices, criterios):
            for item in grupo:
                datos = item.model_dump(exclude={"codigo"}, exclude_unset=True)
                if item.codigo_padre is not None and not item.competencia:
                    datos["competencia"] = competencia_final(item.codigo_padre)
                existente = existentes.get(item.codigo)
                if existente:
                    # Solo los campos enviados: no pisar p. ej. el programa con su valor por defecto
                    for campo, valor in datos.items():
                        setattr(existente, campo, valor)
                    actualizados += 1
                else:
                    db.add(RaAbetCatalogo(codigo=item.codigo, **{**item.model_dump(exclude={"codigo"}), **datos}))
                    creados += 1
            # Los RA deben existir en la BD antes de insertar Criterios que los referencian (FK)
            db.flush()
        db.commit()
    except Exception:
        db.rollback()
        raise
    return RaAbetImportResultado(creados=creados, actualizados=actualizados)


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
    """
    ra = _obtener(codigo, db)
    datos = body.model_dump(exclude_unset=True)

    if "codigo_padre" in datos:
        nuevo_padre = datos["codigo_padre"]
        if (ra.codigo_padre is None) != (nuevo_padre is None):
            raise _error_cambio_nivel(codigo)
        if nuevo_padre is not None:
            _validar_padre(nuevo_padre, db)

    for campo, valor in datos.items():
        setattr(ra, campo, valor)
    db.commit()
    db.refresh(ra)
    return ra


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
    ra_abet y ningún aspecto de rúbrica está vinculado a él.
    """
    ra = _obtener(codigo, db)
    hijos = _contar_hijos(codigo, db)
    if hijos:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No se puede eliminar '{codigo}' porque tiene {hijos} "
                   f"criterio{'s' if hijos != 1 else ''}; elimínelos primero.",
        )
    en_uso = _cursos_que_usan(codigo, db)
    if en_uso:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No se puede eliminar '{codigo}' porque está en uso por "
                   f"{en_uso} curso{'s' if en_uso != 1 else ''}.",
        )
    # Desvincular en silencio haría desaparecer sus calificaciones del reporte ABET
    aspectos = _aspectos_que_usan(codigo, db)
    if aspectos:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No se puede eliminar '{codigo}' porque está vinculado a {aspectos} "
                   f"aspecto{'s' if aspectos != 1 else ''} de rúbrica.",
        )
    db.delete(ra)
    db.commit()
