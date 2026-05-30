from decimal import Decimal
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import (
    Curso, Actividad, Seccion, Estudiante, EquipoTrabajo,
    Calificacion, Criterio, Aspecto,
)
from app.schemas.calificacion import (
    CalificacionCreate, CalificacionOut, CalificacionUpdate,
    CalificacionMasivo, ResumenCalificacion,
)
from app.utils.calculo import calcular_nota_parcial

router = APIRouter(tags=["Calificaciones"])


def _verificar_actividad_docente(actividad_id: int, email: str, db: Session) -> Actividad:
    actividad = db.get(Actividad, actividad_id)
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    curso = db.get(Curso, actividad.curso_id)
    if not curso or curso.docente_email != email:
        raise HTTPException(status_code=403, detail="No tiene permiso sobre esta actividad")
    return actividad


def _criterios_de_actividad(actividad_id: int, db: Session) -> List[Criterio]:
    return (
        db.query(Criterio)
        .join(Aspecto, Criterio.aspecto_id == Aspecto.id)
        .filter(Aspecto.actividad_id == actividad_id)
        .all()
    )


def _nota_total(entity_id: int, es_equipo: bool, actividad_id: int, db: Session) -> Decimal:
    filter_col = Calificacion.equipo_id if es_equipo else Calificacion.estudiante_id
    result = (
        db.query(func.sum(Calificacion.nota_calculada))
        .join(Criterio, Calificacion.criterio_id == Criterio.id)
        .join(Aspecto, Criterio.aspecto_id == Aspecto.id)
        .filter(filter_col == entity_id, Aspecto.actividad_id == actividad_id)
        .scalar()
    )
    return result or Decimal("0")


@router.get(
    "/actividades/{actividad_id}/calificaciones/{seccion_id}",
    response_model=List[ResumenCalificacion],
    summary="Resumen de calificaciones de una actividad por sección",
)
def resumen_calificaciones(
    actividad_id: int,
    seccion_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Devuelve el estado de calificación para cada equipo (grupal)
    o estudiante (individual) de la sección.
    """
    actividad = _verificar_actividad_docente(actividad_id, usuario["email"], db)
    seccion = db.get(Seccion, seccion_id)
    if not seccion or seccion.curso_id != actividad.curso_id:
        raise HTTPException(status_code=404, detail="Sección no encontrada en este curso")

    total_criterios = (
        db.query(func.count(Criterio.id))
        .join(Aspecto, Criterio.aspecto_id == Aspecto.id)
        .filter(Aspecto.actividad_id == actividad_id)
        .scalar()
        or 0
    )

    resultado: List[ResumenCalificacion] = []

    if actividad.tipo.value == "grupal":
        equipos = (
            db.query(EquipoTrabajo)
            .filter(
                EquipoTrabajo.actividad_id == actividad_id,
                EquipoTrabajo.seccion_id == seccion_id,
            )
            .all()
        )
        for equipo in equipos:
            calificados_count = (
                db.query(func.count(Calificacion.id))
                .join(Criterio, Calificacion.criterio_id == Criterio.id)
                .join(Aspecto, Criterio.aspecto_id == Aspecto.id)
                .filter(
                    Calificacion.equipo_id == equipo.id,
                    Aspecto.actividad_id == actividad_id,
                )
                .scalar()
                or 0
            )
            calificado = total_criterios > 0 and calificados_count >= total_criterios
            nota = _nota_total(equipo.id, True, actividad_id, db) if calificado else None
            resultado.append(ResumenCalificacion(
                equipo_id=equipo.id,
                nombre=equipo.nombre,
                nota_total=nota,
                calificado=calificado,
                criterios_calificados=calificados_count,
                criterios_totales=total_criterios,
            ))
    else:
        estudiantes = (
            db.query(Estudiante)
            .filter(Estudiante.seccion_id == seccion_id)
            .order_by(Estudiante.nombre_completo)
            .all()
        )
        for est in estudiantes:
            calificados_count = (
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
            calificado = total_criterios > 0 and calificados_count >= total_criterios
            nota = _nota_total(est.id, False, actividad_id, db) if calificado else None
            resultado.append(ResumenCalificacion(
                estudiante_id=est.id,
                nombre=est.nombre_completo,
                nota_total=nota,
                calificado=calificado,
                criterios_calificados=calificados_count,
                criterios_totales=total_criterios,
            ))

    return resultado


@router.post(
    "/calificaciones",
    response_model=List[CalificacionOut],
    status_code=status.HTTP_201_CREATED,
    summary="Guardar calificación completa",
)
def guardar_calificacion(
    body: CalificacionCreate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Guarda la calificación de un equipo o estudiante para una actividad.
    Recibe todos los valores de criterios a la vez.
    Si ya existe calificación previa para algún criterio, la reemplaza.
    """
    actividad = _verificar_actividad_docente(body.actividad_id, usuario["email"], db)

    if body.equipo_id:
        equipo = db.get(EquipoTrabajo, body.equipo_id)
        if not equipo or equipo.actividad_id != body.actividad_id:
            raise HTTPException(
                status_code=400,
                detail="El equipo no pertenece a esta actividad",
            )
    if body.estudiante_id:
        est = db.get(Estudiante, body.estudiante_id)
        if not est:
            raise HTTPException(status_code=404, detail="Estudiante no encontrado")
        # Verificar que el estudiante pertenece al curso
        seccion = db.get(Seccion, est.seccion_id)
        if not seccion or seccion.curso_id != actividad.curso_id:
            raise HTTPException(
                status_code=400,
                detail="El estudiante no pertenece a este curso",
            )

    criterios_map = {c.id: c for c in _criterios_de_actividad(body.actividad_id, db)}
    guardadas: List[CalificacionOut] = []

    for vc in body.criterios:
        criterio = criterios_map.get(vc.criterio_id)
        if not criterio:
            raise HTTPException(
                status_code=400,
                detail=f"Criterio {vc.criterio_id} no pertenece a esta actividad",
            )

        nota_parcial = calcular_nota_parcial(vc.valor, criterio.peso_porcentaje)

        # Buscar calificación previa para este criterio + entidad
        filtro = [Calificacion.criterio_id == vc.criterio_id]
        if body.equipo_id:
            filtro.append(Calificacion.equipo_id == body.equipo_id)
        else:
            filtro.append(Calificacion.estudiante_id == body.estudiante_id)

        existente = db.query(Calificacion).filter(*filtro).first()
        if existente:
            existente.valor = vc.valor
            existente.nota_calculada = nota_parcial
            db.flush()
            guardadas.append(CalificacionOut.model_validate(existente))
        else:
            nueva = Calificacion(
                criterio_id=vc.criterio_id,
                valor=vc.valor,
                equipo_id=body.equipo_id,
                estudiante_id=body.estudiante_id,
                nota_calculada=nota_parcial,
            )
            db.add(nueva)
            db.flush()
            guardadas.append(CalificacionOut.model_validate(nueva))

    db.commit()
    return guardadas


@router.patch(
    "/calificaciones/{calificacion_id}",
    response_model=CalificacionOut,
    summary="Editar valor de una calificación",
)
def editar_calificacion(
    calificacion_id: int,
    body: CalificacionUpdate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Actualiza el valor binario de una calificación y recalcula su puntaje parcial."""
    calificacion = db.get(Calificacion, calificacion_id)
    if not calificacion:
        raise HTTPException(status_code=404, detail="Calificación no encontrada")

    criterio = db.get(Criterio, calificacion.criterio_id)
    aspecto = db.get(Aspecto, criterio.aspecto_id)
    actividad = db.get(Actividad, aspecto.actividad_id)
    curso = db.get(Curso, actividad.curso_id)
    if not curso or curso.docente_email != usuario["email"]:
        raise HTTPException(status_code=403, detail="No tiene permiso sobre esta calificación")

    calificacion.valor = body.valor
    calificacion.nota_calculada = calcular_nota_parcial(body.valor, criterio.peso_porcentaje)
    db.commit()
    db.refresh(calificacion)
    return calificacion


@router.post(
    "/actividades/{actividad_id}/calificaciones/masivo",
    response_model=List[CalificacionOut],
    status_code=status.HTTP_201_CREATED,
    summary="Aplicar calificación masiva a todos los equipos sin calificar",
)
def calificacion_masivo(
    actividad_id: int,
    body: CalificacionMasivo,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Aplica los mismos valores de criterios a todos los equipos de la sección
    que todavía no tienen calificación. Los equipos ya calificados no se modifican.
    """
    actividad = _verificar_actividad_docente(actividad_id, usuario["email"], db)

    seccion = db.get(Seccion, body.seccion_id)
    if not seccion or seccion.curso_id != actividad.curso_id:
        raise HTTPException(status_code=404, detail="Sección no encontrada en este curso")

    equipos = (
        db.query(EquipoTrabajo)
        .filter(
            EquipoTrabajo.actividad_id == actividad_id,
            EquipoTrabajo.seccion_id == body.seccion_id,
        )
        .all()
    )

    criterios_map = {c.id: c for c in _criterios_de_actividad(actividad_id, db)}
    total_criterios = len(criterios_map)
    todas_guardadas: List[CalificacionOut] = []

    for equipo in equipos:
        # Solo procesar equipos sin calificación
        ya_calificados = (
            db.query(func.count(Calificacion.id))
            .join(Criterio, Calificacion.criterio_id == Criterio.id)
            .join(Aspecto, Criterio.aspecto_id == Aspecto.id)
            .filter(
                Calificacion.equipo_id == equipo.id,
                Aspecto.actividad_id == actividad_id,
            )
            .scalar()
            or 0
        )
        if ya_calificados >= total_criterios:
            continue

        for vc in body.criterios:
            criterio = criterios_map.get(vc.criterio_id)
            if not criterio:
                continue
            nota_parcial = calcular_nota_parcial(vc.valor, criterio.peso_porcentaje)
            nueva = Calificacion(
                criterio_id=vc.criterio_id,
                valor=vc.valor,
                equipo_id=equipo.id,
                nota_calculada=nota_parcial,
            )
            db.add(nueva)
            db.flush()
            todas_guardadas.append(CalificacionOut.model_validate(nueva))

    db.commit()
    return todas_guardadas
