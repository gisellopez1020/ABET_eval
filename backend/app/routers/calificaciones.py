from decimal import Decimal
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import Actividad, Calificacion
from app.repositories.actividad import ActividadRepository
from app.repositories.calificacion import CalificacionRepository
from app.repositories.curso import CursoRepository
from app.repositories.equipo import EquipoRepository
from app.repositories.estudiante import EstudianteRepository
from app.repositories.rubrica import RubricaRepository
from app.repositories.seccion import SeccionRepository
from app.schemas.calificacion import (
    CalificacionCreate, CalificacionOut, CalificacionUpdate,
    CalificacionMasivo, ResumenCalificacion,
)
from app.utils.calculo import calcular_nota_parcial

router = APIRouter(tags=["Calificaciones"])


def _verificar_actividad_docente(actividad_id: int, email: str, db: Session) -> Actividad:
    actividad = ActividadRepository(db).get(actividad_id)
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    curso = CursoRepository(db).get(actividad.curso_id)
    if not curso or curso.docente_email != email:
        raise HTTPException(status_code=403, detail="No tiene permiso sobre esta actividad")
    return actividad


def _nota_total(entity_id: int, es_equipo: bool, actividad_id: int, db: Session) -> Decimal:
    repo = CalificacionRepository(db)
    if es_equipo:
        result = repo.suma_notas_de_equipo(entity_id, actividad_id)
    else:
        result = repo.suma_notas_de_estudiante(entity_id, actividad_id)
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
    seccion = SeccionRepository(db).get(seccion_id)
    if not seccion or seccion.curso_id != actividad.curso_id:
        raise HTTPException(status_code=404, detail="Sección no encontrada en este curso")

    total_criterios = RubricaRepository(db).contar_criterios(actividad_id)
    calificaciones = CalificacionRepository(db)

    resultado: List[ResumenCalificacion] = []

    if actividad.tipo.value == "grupal":
        equipos = EquipoRepository(db).de_actividad_y_seccion(actividad_id, seccion_id)
        for equipo in equipos:
            calificados_count = calificaciones.contar_de_equipo(equipo.id, actividad_id)
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
        estudiantes = EstudianteRepository(db).de_seccion(seccion_id)
        for est in estudiantes:
            calificados_count = calificaciones.contar_de_estudiante(est.id, actividad_id)
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


@router.get(
    "/actividades/{actividad_id}/equipos/{equipo_id}/calificaciones",
    response_model=List[CalificacionOut],
    summary="Calificaciones de un equipo en una actividad",
)
def calificaciones_equipo(
    actividad_id: int,
    equipo_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Devuelve las calificaciones guardadas de un equipo, una por criterio calificado
    de la actividad. Los criterios sin fila todavía no tienen calificación.
    """
    _verificar_actividad_docente(actividad_id, usuario["email"], db)
    equipo = EquipoRepository(db).get(equipo_id)
    if not equipo or equipo.actividad_id != actividad_id:
        raise HTTPException(status_code=404, detail="Equipo no encontrado en esta actividad")

    return CalificacionRepository(db).de_equipo(equipo_id, actividad_id)


@router.get(
    "/actividades/{actividad_id}/estudiantes/{estudiante_id}/calificaciones",
    response_model=List[CalificacionOut],
    summary="Calificaciones individuales de un estudiante en una actividad",
)
def calificaciones_estudiante(
    actividad_id: int,
    estudiante_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Devuelve las calificaciones individuales guardadas de un estudiante, una por
    criterio calificado de la actividad. No incluye las de sus equipos.
    """
    actividad = _verificar_actividad_docente(actividad_id, usuario["email"], db)
    estudiante = EstudianteRepository(db).get(estudiante_id)
    seccion = SeccionRepository(db).get(estudiante.seccion_id) if estudiante else None
    if not seccion or seccion.curso_id != actividad.curso_id:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado en este curso")

    return CalificacionRepository(db).de_estudiante(estudiante_id, actividad_id)


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
        equipo = EquipoRepository(db).get(body.equipo_id)
        if not equipo or equipo.actividad_id != body.actividad_id:
            raise HTTPException(
                status_code=400,
                detail="El equipo no pertenece a esta actividad",
            )
    if body.estudiante_id:
        est = EstudianteRepository(db).get(body.estudiante_id)
        if not est:
            raise HTTPException(status_code=404, detail="Estudiante no encontrado")
        # Verificar que el estudiante pertenece al curso
        seccion = SeccionRepository(db).get(est.seccion_id)
        if not seccion or seccion.curso_id != actividad.curso_id:
            raise HTTPException(
                status_code=400,
                detail="El estudiante no pertenece a este curso",
            )

    criterios_map = {c.id: c for c in RubricaRepository(db).criterios_de_actividad(body.actividad_id)}
    calificaciones = CalificacionRepository(db)
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
        if body.equipo_id:
            existente = calificaciones.de_criterio_y_equipo(vc.criterio_id, body.equipo_id)
        else:
            existente = calificaciones.de_criterio_y_estudiante(vc.criterio_id, body.estudiante_id)

        if existente:
            calificaciones.actualizar(existente, vc.valor, nota_parcial)
            guardadas.append(CalificacionOut.model_validate(existente))
        else:
            nueva = calificaciones.agregar(Calificacion(
                criterio_id=vc.criterio_id,
                valor=vc.valor,
                equipo_id=body.equipo_id,
                estudiante_id=body.estudiante_id,
                nota_calculada=nota_parcial,
            ))
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
    calificacion = CalificacionRepository(db).get(calificacion_id)
    if not calificacion:
        raise HTTPException(status_code=404, detail="Calificación no encontrada")

    rubrica = RubricaRepository(db)
    criterio = rubrica.get_criterio(calificacion.criterio_id)
    aspecto = rubrica.get_aspecto(criterio.aspecto_id)
    actividad = ActividadRepository(db).get(aspecto.actividad_id)
    curso = CursoRepository(db).get(actividad.curso_id)
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
    que todavía no tienen calificación. Los equipos ya calificados no se modifican;
    uno calificado en parte conserva lo que tiene y solo recibe los criterios que le faltan.
    """
    actividad = _verificar_actividad_docente(actividad_id, usuario["email"], db)

    seccion = SeccionRepository(db).get(body.seccion_id)
    if not seccion or seccion.curso_id != actividad.curso_id:
        raise HTTPException(status_code=404, detail="Sección no encontrada en este curso")

    equipos = EquipoRepository(db).de_actividad_y_seccion(actividad_id, body.seccion_id)

    criterios_map = {c.id: c for c in RubricaRepository(db).criterios_de_actividad(actividad_id)}
    calificaciones = CalificacionRepository(db)
    total_criterios = len(criterios_map)
    todas_guardadas: List[CalificacionOut] = []

    for equipo in equipos:
        # Criterios que el equipo ya tiene calificados: no se sobrescriben
        ya_calificados = {
            c.criterio_id
            for c in calificaciones.de_equipo(equipo.id, actividad_id)
        }
        if len(ya_calificados) >= total_criterios:
            continue

        for vc in body.criterios:
            criterio = criterios_map.get(vc.criterio_id)
            if not criterio or vc.criterio_id in ya_calificados:
                continue
            ya_calificados.add(vc.criterio_id)  # un criterio repetido en el body se inserta una vez
            nota_parcial = calcular_nota_parcial(vc.valor, criterio.peso_porcentaje)
            nueva = calificaciones.agregar(Calificacion(
                criterio_id=vc.criterio_id,
                valor=vc.valor,
                equipo_id=equipo.id,
                nota_calculada=nota_parcial,
            ))
            todas_guardadas.append(CalificacionOut.model_validate(nueva))

    db.commit()
    return todas_guardadas
