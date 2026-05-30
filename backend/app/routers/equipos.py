from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import (
    Curso, Actividad, Seccion, Estudiante, EquipoTrabajo, MiembroEquipo,
    Calificacion, Criterio, Aspecto,
)
from app.models.actividad import TipoActividad
from app.schemas.equipo import (
    EquiposPayload, EquipoUpdate, EquipoOut,
    ModoCalificacionItem, ModoCalificacionResponse,
)
from app.schemas.estudiante import EstudianteOut

router = APIRouter(tags=["Equipos de trabajo"])


def _verificar_actividad_seccion(
    actividad_id: int, seccion_id: int, email: str, db: Session
) -> tuple[Actividad, Seccion]:
    actividad = db.get(Actividad, actividad_id)
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    curso = db.get(Curso, actividad.curso_id)
    if not curso or curso.docente_email != email:
        raise HTTPException(status_code=403, detail="No tiene permiso sobre esta actividad")
    seccion = db.get(Seccion, seccion_id)
    if not seccion or seccion.curso_id != actividad.curso_id:
        raise HTTPException(
            status_code=404, detail="Sección no encontrada en este curso"
        )
    return actividad, seccion


def _nota_total_equipo(equipo_id: int, actividad_id: int, db: Session) -> Optional[Decimal]:
    """Suma las notas parciales de todos los criterios calificados para el equipo."""
    result = (
        db.query(func.sum(Calificacion.nota_calculada))
        .join(Criterio, Calificacion.criterio_id == Criterio.id)
        .join(Aspecto, Criterio.aspecto_id == Aspecto.id)
        .filter(
            Calificacion.equipo_id == equipo_id,
            Aspecto.actividad_id == actividad_id,
        )
        .scalar()
    )
    return result


def _nota_total_estudiante(estudiante_id: int, actividad_id: int, db: Session) -> Optional[Decimal]:
    result = (
        db.query(func.sum(Calificacion.nota_calculada))
        .join(Criterio, Calificacion.criterio_id == Criterio.id)
        .join(Aspecto, Criterio.aspecto_id == Aspecto.id)
        .filter(
            Calificacion.estudiante_id == estudiante_id,
            Aspecto.actividad_id == actividad_id,
        )
        .scalar()
    )
    return result


def _criterios_calificados_equipo(equipo_id: int, actividad_id: int, db: Session) -> int:
    return (
        db.query(func.count(Calificacion.id))
        .join(Criterio, Calificacion.criterio_id == Criterio.id)
        .join(Aspecto, Criterio.aspecto_id == Aspecto.id)
        .filter(
            Calificacion.equipo_id == equipo_id,
            Aspecto.actividad_id == actividad_id,
        )
        .scalar()
        or 0
    )


def _total_criterios_actividad(actividad_id: int, db: Session) -> int:
    return (
        db.query(func.count(Criterio.id))
        .join(Aspecto, Criterio.aspecto_id == Aspecto.id)
        .filter(Aspecto.actividad_id == actividad_id)
        .scalar()
        or 0
    )


def _build_equipo_out(equipo: EquipoTrabajo, actividad_id: int, db: Session) -> EquipoOut:
    miembros = [EstudianteOut.model_validate(m.estudiante) for m in equipo.miembros]
    total_criterios = _total_criterios_actividad(actividad_id, db)
    calificados = _criterios_calificados_equipo(equipo.id, actividad_id, db)
    calificado = total_criterios > 0 and calificados >= total_criterios
    nota = _nota_total_equipo(equipo.id, actividad_id, db) if calificado else None
    return EquipoOut(
        id=equipo.id,
        nombre=equipo.nombre,
        actividad_id=equipo.actividad_id,
        seccion_id=equipo.seccion_id,
        miembros=miembros,
        calificado=calificado,
        nota_total=nota,
    )


@router.get(
    "/actividades/{actividad_id}/secciones/{seccion_id}/equipos",
    response_model=List[EquipoOut],
    summary="Listar equipos de trabajo",
)
def listar_equipos(
    actividad_id: int,
    seccion_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Lista los equipos de trabajo para la actividad en la sección indicada."""
    _verificar_actividad_seccion(actividad_id, seccion_id, usuario["email"], db)
    equipos = (
        db.query(EquipoTrabajo)
        .filter(
            EquipoTrabajo.actividad_id == actividad_id,
            EquipoTrabajo.seccion_id == seccion_id,
        )
        .all()
    )
    return [_build_equipo_out(e, actividad_id, db) for e in equipos]


@router.post(
    "/actividades/{actividad_id}/secciones/{seccion_id}/equipos",
    response_model=List[EquipoOut],
    status_code=status.HTTP_201_CREATED,
    summary="Crear equipos de trabajo",
)
def crear_equipos(
    actividad_id: int,
    seccion_id: int,
    body: EquiposPayload,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Crea uno o varios equipos de trabajo para la actividad en la sección.
    Cada equipo puede incluir una lista de estudiante_ids.
    """
    actividad, seccion = _verificar_actividad_seccion(
        actividad_id, seccion_id, usuario["email"], db
    )
    if actividad.tipo != TipoActividad.grupal:
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden crear equipos para actividades de tipo grupal",
        )

    nuevos: List[EquipoTrabajo] = []
    for eq_in in body.equipos:
        equipo = EquipoTrabajo(
            nombre=eq_in.nombre,
            actividad_id=actividad_id,
            seccion_id=seccion_id,
        )
        db.add(equipo)
        db.flush()

        for est_id in eq_in.estudiante_ids:
            estudiante = db.get(Estudiante, est_id)
            if not estudiante or estudiante.seccion_id != seccion_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Estudiante {est_id} no pertenece a la sección {seccion_id}",
                )
            db.add(MiembroEquipo(equipo_id=equipo.id, estudiante_id=est_id))

        nuevos.append(equipo)

    db.commit()
    for e in nuevos:
        db.refresh(e)

    return [_build_equipo_out(e, actividad_id, db) for e in nuevos]


@router.put(
    "/equipos/{equipo_id}",
    response_model=EquipoOut,
    summary="Editar equipo de trabajo",
)
def editar_equipo(
    equipo_id: int,
    body: EquipoUpdate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Edita el nombre del equipo y/o sus integrantes."""
    equipo = db.get(EquipoTrabajo, equipo_id)
    if not equipo:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")
    actividad = db.get(Actividad, equipo.actividad_id)
    curso = db.get(Curso, actividad.curso_id)
    if not curso or curso.docente_email != usuario["email"]:
        raise HTTPException(status_code=403, detail="No tiene permiso sobre este equipo")

    if body.nombre:
        equipo.nombre = body.nombre

    if body.estudiante_ids is not None:
        for m in equipo.miembros:
            db.delete(m)
        db.flush()
        for est_id in body.estudiante_ids:
            estudiante = db.get(Estudiante, est_id)
            if not estudiante or estudiante.seccion_id != equipo.seccion_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Estudiante {est_id} no pertenece a la sección del equipo",
                )
            db.add(MiembroEquipo(equipo_id=equipo_id, estudiante_id=est_id))

    db.commit()
    db.refresh(equipo)
    return _build_equipo_out(equipo, equipo.actividad_id, db)


@router.get(
    "/actividades/{actividad_id}/modo-calificacion/{seccion_id}",
    response_model=ModoCalificacionResponse,
    summary="Obtener modo de calificación (bifurcación grupal/individual)",
)
def modo_calificacion(
    actividad_id: int,
    seccion_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Clave para el frontend: determina si se califica por equipos o por estudiantes.
    Retorna: { tipo, items: [equipos|estudiantes], total, calificados }
    """
    actividad, seccion = _verificar_actividad_seccion(
        actividad_id, seccion_id, usuario["email"], db
    )
    total_criterios = _total_criterios_actividad(actividad_id, db)

    if actividad.tipo == TipoActividad.grupal:
        equipos = (
            db.query(EquipoTrabajo)
            .filter(
                EquipoTrabajo.actividad_id == actividad_id,
                EquipoTrabajo.seccion_id == seccion_id,
            )
            .all()
        )
        items: List[ModoCalificacionItem] = []
        calificados = 0
        for e in equipos:
            miembros = [EstudianteOut.model_validate(m.estudiante) for m in e.miembros]
            calif_count = _criterios_calificados_equipo(e.id, actividad_id, db)
            es_calificado = total_criterios > 0 and calif_count >= total_criterios
            nota = _nota_total_equipo(e.id, actividad_id, db) if es_calificado else None
            if es_calificado:
                calificados += 1
            items.append(ModoCalificacionItem(
                id=e.id,
                nombre=e.nombre,
                miembros=miembros,
                calificado=es_calificado,
                nota_total=nota,
            ))
        return ModoCalificacionResponse(
            tipo="grupal",
            items=items,
            total=len(items),
            calificados=calificados,
        )

    else:  # individual
        estudiantes = (
            db.query(Estudiante)
            .filter(Estudiante.seccion_id == seccion_id)
            .order_by(Estudiante.nombre_completo)
            .all()
        )
        items = []
        calificados = 0
        for est in estudiantes:
            calif_count = (
                db.query(func.count(Calificacion.id))
                .join(Criterio, Calificacion.criterio_id == Criterio.id)
                .join(Aspecto, Criterio.aspecto_id == Aspecto.id)
                .filter(
                    Calificacion.estudiante_id == est.id,
                    Aspecto.actividad_id == actividad_id,
                )
                .scalar()
                or 0
            )
            es_calificado = total_criterios > 0 and calif_count >= total_criterios
            nota = _nota_total_estudiante(est.id, actividad_id, db) if es_calificado else None
            if es_calificado:
                calificados += 1
            items.append(ModoCalificacionItem(
                id=est.id,
                nombre=est.nombre_completo,
                miembros=[EstudianteOut.model_validate(est)],
                calificado=es_calificado,
                nota_total=nota,
            ))
        return ModoCalificacionResponse(
            tipo="individual",
            items=items,
            total=len(items),
            calificados=calificados,
        )
