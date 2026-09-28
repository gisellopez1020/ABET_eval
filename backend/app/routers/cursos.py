from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import (
    Actividad, Aspecto, Calificacion, Criterio, Curso, EquipoTrabajo, Estudiante, RaAbetCatalogo,
)
from app.schemas import ActividadRecienteItem, CursoCreate, CursoUpdate, CursoOut

router = APIRouter(prefix="/cursos", tags=["Cursos"])


def _verificar_propietario(curso: Curso, email: str) -> None:
    if curso.docente_email != email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permiso para acceder a este curso",
        )


def _validar_ra_abet(codigos: List[str], db: Session) -> None:
    """
    Cada código de ra_abet debe existir en ra_abet_catalogo y ser un Resultado de
    Aprendizaje (nivel superior): un curso no selecciona Criterios individuales.
    No se puede validar en el schema: requiere BD.
    """
    if not codigos:
        return
    padres = dict(
        db.query(RaAbetCatalogo.codigo, RaAbetCatalogo.codigo_padre)
        .filter(RaAbetCatalogo.codigo.in_(codigos))
        .all()
    )
    desconocidos = [c for c in codigos if c not in padres]
    if desconocidos:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Códigos RA ABET que no existen en el catálogo: {', '.join(desconocidos)}",
        )
    criterios = [c for c in codigos if padres[c] is not None]
    if criterios:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Un curso solo puede tener Resultados de Aprendizaje, no Criterios: "
                   f"{', '.join(criterios)}",
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
    al más antiguo. Un guardado escribe una fila por criterio, así que se agrupa
    por (actividad, equipo o estudiante) y se toma el updated_at más reciente.
    """
    curso = db.get(Curso, curso_id)
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    _verificar_propietario(curso, usuario["email"])

    ultimo = func.max(Calificacion.updated_at).label("ultimo")
    filas = (
        db.query(
            Actividad.id.label("actividad_id"),
            Actividad.nombre.label("actividad_nombre"),
            Calificacion.equipo_id,
            Calificacion.estudiante_id,
            ultimo,
        )
        .join(Criterio, Calificacion.criterio_id == Criterio.id)
        .join(Aspecto, Criterio.aspecto_id == Aspecto.id)
        .join(Actividad, Aspecto.actividad_id == Actividad.id)
        .filter(Actividad.curso_id == curso_id)
        .group_by(Actividad.id, Actividad.nombre, Calificacion.equipo_id, Calificacion.estudiante_id)
        .order_by(ultimo.desc(), Actividad.id.desc())
        .limit(limit)
        .all()
    )

    equipo_ids = {f.equipo_id for f in filas if f.equipo_id is not None}
    estudiante_ids = {f.estudiante_id for f in filas if f.estudiante_id is not None}
    equipos = dict(
        db.query(EquipoTrabajo.id, EquipoTrabajo.nombre).filter(EquipoTrabajo.id.in_(equipo_ids)).all()
    )
    estudiantes = dict(
        db.query(Estudiante.id, Estudiante.nombre_completo).filter(Estudiante.id.in_(estudiante_ids)).all()
    )

    return [
        ActividadRecienteItem(
            actividad_id=f.actividad_id,
            actividad_nombre=f.actividad_nombre,
            tipo="equipo" if f.equipo_id is not None else "estudiante",
            nombre=equipos[f.equipo_id] if f.equipo_id is not None else estudiantes[f.estudiante_id],
            updated_at=f.ultimo,
        )
        for f in filas
    ]


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


@router.patch("/{curso_id}/activar", response_model=CursoOut, summary="Reactivar curso")
def activar_curso(
    curso_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Marca el curso como activo nuevamente (revierte el archivado)."""
    curso = db.get(Curso, curso_id)
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    _verificar_propietario(curso, usuario["email"])

    curso.activo = True
    db.commit()
    db.refresh(curso)
    return curso
