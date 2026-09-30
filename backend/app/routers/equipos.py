from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import Actividad, Seccion, EquipoTrabajo
from app.models.actividad import TipoActividad
from app.repositories.actividad import ActividadRepository
from app.repositories.calificacion import CalificacionRepository
from app.repositories.curso import CursoRepository
from app.repositories.equipo import EquipoRepository
from app.repositories.estudiante import EstudianteRepository
from app.repositories.rubrica import RubricaRepository
from app.repositories.seccion import SeccionRepository
from app.schemas.equipo import (
    EquiposPayload, EquipoUpdate, EquipoOut,
    ModoCalificacionItem, ModoCalificacionResponse,
)
from app.schemas.estudiante import EstudianteOut

router = APIRouter(tags=["Equipos de trabajo"])


def _verificar_actividad_seccion(
    actividad_id: int, seccion_id: int, email: str, db: Session
) -> tuple[Actividad, Seccion]:
    actividad = ActividadRepository(db).get(actividad_id)
    if not actividad:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    curso = CursoRepository(db).get(actividad.curso_id)
    if not curso or curso.docente_email != email:
        raise HTTPException(status_code=403, detail="No tiene permiso sobre esta actividad")
    seccion = SeccionRepository(db).get(seccion_id)
    if not seccion or seccion.curso_id != actividad.curso_id:
        raise HTTPException(
            status_code=404, detail="Sección no encontrada en este curso"
        )
    return actividad, seccion


def _validar_sin_otro_equipo(
    estudiante_ids: List[int], actividad_id: int, db: Session,
    excluir_equipo_id: Optional[int] = None,
) -> None:
    """Un estudiante solo puede estar en un equipo por actividad (en otras actividades, sí)."""
    if not estudiante_ids:
        return
    choque = EquipoRepository(db).choque_de_membresia(estudiante_ids, actividad_id, excluir_equipo_id)
    if choque:
        raise HTTPException(
            status_code=400,
            detail=f"El estudiante {choque[0]} ya está en el equipo '{choque[1]}' de esta actividad",
        )


def _build_equipo_out(equipo: EquipoTrabajo, actividad_id: int, db: Session) -> EquipoOut:
    miembros = [EstudianteOut.model_validate(m.estudiante) for m in equipo.miembros]
    calificaciones = CalificacionRepository(db)
    total_criterios = RubricaRepository(db).contar_criterios(actividad_id)
    calificados = calificaciones.contar_de_equipo(equipo.id, actividad_id)
    calificado = total_criterios > 0 and calificados >= total_criterios
    nota = calificaciones.suma_notas_de_equipo(equipo.id, actividad_id) if calificado else None
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
    equipos = EquipoRepository(db).de_actividad_y_seccion(actividad_id, seccion_id)
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
    Cada equipo puede incluir una lista de estudiante_ids; cada estudiante debe ser
    de la sección y no estar ya en otro equipo de la actividad (400 si no).
    """
    actividad, seccion = _verificar_actividad_seccion(
        actividad_id, seccion_id, usuario["email"], db
    )
    if actividad.tipo != TipoActividad.grupal:
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden crear equipos para actividades de tipo grupal",
        )

    # Validar todos los miembros antes de crear nada
    equipo_de: dict[int, int] = {}  # estudiante_id -> índice del equipo del payload
    estudiantes = EstudianteRepository(db)
    for idx, eq_in in enumerate(body.equipos):
        for est_id in eq_in.estudiante_ids:
            estudiante = estudiantes.get(est_id)
            if not estudiante or estudiante.seccion_id != seccion_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Estudiante {est_id} no pertenece a la sección {seccion_id}",
                )
            previo = equipo_de.setdefault(est_id, idx)
            if previo != idx:
                raise HTTPException(
                    status_code=400,
                    detail=f"El estudiante {estudiante.nombre_completo} está en dos equipos: "
                           f"'{body.equipos[previo].nombre}' y '{eq_in.nombre}'",
                )
    _validar_sin_otro_equipo(list(equipo_de), actividad_id, db)

    equipos = EquipoRepository(db)
    nuevos: List[EquipoTrabajo] = []
    for eq_in in body.equipos:
        equipo = equipos.agregar(EquipoTrabajo(
            nombre=eq_in.nombre,
            actividad_id=actividad_id,
            seccion_id=seccion_id,
        ))

        for est_id in eq_in.estudiante_ids:
            equipos.agregar_miembro(equipo.id, est_id)

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
    """
    Edita el nombre del equipo y/o sus integrantes. Cada integrante debe ser de la
    sección del equipo y no estar en otro equipo de la actividad (400 si no).
    """
    equipos = EquipoRepository(db)
    equipo = equipos.get(equipo_id)
    if not equipo:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")
    actividad = ActividadRepository(db).get(equipo.actividad_id)
    curso = CursoRepository(db).get(actividad.curso_id)
    if not curso or curso.docente_email != usuario["email"]:
        raise HTTPException(status_code=403, detail="No tiene permiso sobre este equipo")

    if body.nombre:
        equipo.nombre = body.nombre

    if body.estudiante_ids is not None:
        estudiantes = EstudianteRepository(db)
        for est_id in body.estudiante_ids:
            estudiante = estudiantes.get(est_id)
            if not estudiante or estudiante.seccion_id != equipo.seccion_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Estudiante {est_id} no pertenece a la sección del equipo",
                )
        # El propio equipo no cuenta: guardar sin cambios no choca consigo mismo
        _validar_sin_otro_equipo(body.estudiante_ids, equipo.actividad_id, db, excluir_equipo_id=equipo_id)

        equipos.eliminar_miembros(equipo)
        for est_id in body.estudiante_ids:
            equipos.agregar_miembro(equipo_id, est_id)

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
    total_criterios = RubricaRepository(db).contar_criterios(actividad_id)
    calificaciones = CalificacionRepository(db)

    if actividad.tipo == TipoActividad.grupal:
        equipos = EquipoRepository(db).de_actividad_y_seccion(actividad_id, seccion_id)
        items: List[ModoCalificacionItem] = []
        calificados = 0
        for e in equipos:
            miembros = [EstudianteOut.model_validate(m.estudiante) for m in e.miembros]
            calif_count = calificaciones.contar_de_equipo(e.id, actividad_id)
            es_calificado = total_criterios > 0 and calif_count >= total_criterios
            nota = calificaciones.suma_notas_de_equipo(e.id, actividad_id) if es_calificado else None
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
        estudiantes = EstudianteRepository(db).de_seccion(seccion_id)
        items = []
        calificados = 0
        for est in estudiantes:
            calif_count = calificaciones.contar_de_estudiante(est.id, actividad_id)
            es_calificado = total_criterios > 0 and calif_count >= total_criterios
            nota = calificaciones.suma_notas_de_estudiante(est.id, actividad_id) if es_calificado else None
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
