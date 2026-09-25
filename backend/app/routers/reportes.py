from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import (
    Curso, Actividad, Seccion, EquipoTrabajo, MiembroEquipo, Estudiante,
    Calificacion, Criterio, Aspecto, RaAbetCatalogo,
)
from app.models.curso import RANGOS_CALIFICACION_DEFAULT
from app.schemas.reporte import (
    RangoReporte, ReporteABETResponse, ReporteCriterioItem, ReporteRAItem,
)

router = APIRouter(prefix="/reportes", tags=["Reportes ABET"])

CINCO = Decimal("5")
UN_DECIMAL = Decimal("0.1")

# Fuente de calificaciones: ("e", estudiante_id) o ("t", equipo_id)
Fuente = tuple[str, int]


def _orden_codigo(codigo: str) -> tuple:
    """Orden natural de códigos: "2.1.2" antes de "2.1.10"."""
    return tuple((0, int(p), "") if p.isdigit() else (1, 0, p) for p in codigo.split("."))


def _clasificar(nota: Decimal, rangos: list[RangoReporte]) -> Optional[str]:
    """
    Redondea a 1 decimal (mitad hacia arriba) y busca el rango [minimo, maximo]
    que la contiene. None si cae en un hueco entre rangos.
    """
    nota = nota.quantize(UN_DECIMAL, rounding=ROUND_HALF_UP)
    for r in rangos:
        if Decimal(str(r.minimo)) <= nota <= Decimal(str(r.maximo)):
            return r.etiqueta
    return None


def _distribucion(notas: list[Decimal], rangos: list[RangoReporte]) -> tuple[dict[str, int], int]:
    conteo = {r.etiqueta: 0 for r in rangos}
    sin_clasificar = 0
    for nota in notas:
        etiqueta = _clasificar(nota, rangos)
        if etiqueta is None:
            sin_clasificar += 1
        else:
            conteo[etiqueta] += 1
    return conteo, sin_clasificar


def _notas_bloque(
    valores: dict[int, int],
    aspectos: dict[int, tuple[int, str, dict[int, Decimal]]],
) -> dict[tuple[int, str], Decimal]:
    """
    Nota 0-5 de cada bloque (actividad, codigo_abet) para una fuente de calificaciones.
    Cada aspecto se normaliza a su propia escala: 5 * sum(valor_i * p_i) / sum(p_i),
    sin importar cuánto pese dentro de la actividad. Los aspectos de una misma
    actividad vinculados al mismo código forman un solo bloque. Un aspecto sin
    todos sus criterios calificados se omite (no cuenta como 0).
    """
    acumulado: dict[tuple[int, str], list[Decimal]] = defaultdict(lambda: [Decimal(0), Decimal(0)])
    for actividad_id, codigo, pesos in aspectos.values():
        if not all(cid in valores for cid in pesos):
            continue
        suma = acumulado[(actividad_id, codigo)]
        for cid, peso in pesos.items():
            suma[0] += valores[cid] * peso
            suma[1] += peso
    return {bloque: CINCO * vp / p for bloque, (vp, p) in acumulado.items() if p > 0}


@router.get(
    "/abet/{curso_id}",
    response_model=ReporteABETResponse,
    summary="Reporte ABET por curso",
)
def reporte_abet(
    curso_id: int,
    seccion_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Reporte ABET del curso en dos niveles, contando por estudiante:

    - Por Criterio ABET (ej. 2.1.1): solo los códigos vinculados a algún aspecto
      de alguna actividad del curso. La nota de cada estudiante es el promedio
      simple de sus bloques (una actividad = un bloque por código), cada uno en
      escala 0-5.
    - Por Resultado de Aprendizaje (ej. 2.1): promedio de las notas de sus
      Criterios ponderado por su peso en el catálogo, renormalizado sobre los
      Criterios que el estudiante tiene evaluados.

    En actividades grupales cada integrante del equipo recibe la nota del equipo.
    La clasificación usa curso.rangos_calificacion.

    Parámetro opcional:
    - seccion_id: filtrar por sección
    """
    curso = db.get(Curso, curso_id)
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    if curso.docente_email != usuario["email"]:
        raise HTTPException(status_code=403, detail="No tiene permiso sobre este curso")

    rangos = sorted(
        (RangoReporte(**r) for r in (curso.rangos_calificacion or RANGOS_CALIFICACION_DEFAULT)),
        key=lambda r: r.minimo,
    )

    # Aspectos vinculados del curso: {aspecto_id: (actividad_id, codigo_abet, {criterio_id: peso})}
    aspectos: dict[int, tuple[int, str, dict[int, Decimal]]] = {}
    filas_criterios = (
        db.query(Aspecto.id, Aspecto.actividad_id, Aspecto.codigo_abet, Criterio.id, Criterio.peso_porcentaje)
        .join(Actividad, Aspecto.actividad_id == Actividad.id)
        .join(Criterio, Criterio.aspecto_id == Aspecto.id)
        .filter(Actividad.curso_id == curso_id, Aspecto.codigo_abet.isnot(None))
        .all()
    )
    for aspecto_id, actividad_id, codigo, criterio_id, peso in filas_criterios:
        aspectos.setdefault(aspecto_id, (actividad_id, codigo, {}))[2][criterio_id] = Decimal(peso)
    codigos_vinculados = {codigo for _, codigo, _ in aspectos.values()}

    # Estudiantes del curso (o de la sección filtrada)
    q_est = db.query(Estudiante.id).join(Seccion, Estudiante.seccion_id == Seccion.id).filter(
        Seccion.curso_id == curso_id
    )
    if seccion_id:
        q_est = q_est.filter(Estudiante.seccion_id == seccion_id)
    estudiantes = [eid for (eid,) in q_est.all()]

    # Fuentes de cada estudiante: sus calificaciones propias y las de sus equipos
    fuentes_est: dict[int, list[Fuente]] = {eid: [("e", eid)] for eid in estudiantes}
    membresias = (
        db.query(MiembroEquipo.estudiante_id, MiembroEquipo.equipo_id)
        .join(EquipoTrabajo, MiembroEquipo.equipo_id == EquipoTrabajo.id)
        .join(Actividad, EquipoTrabajo.actividad_id == Actividad.id)
        .filter(Actividad.curso_id == curso_id)
        .all()
    )
    for eid, equipo_id in membresias:
        if eid in fuentes_est:
            fuentes_est[eid].append(("t", equipo_id))

    # Valores calificados por fuente: {fuente: {criterio_id: valor}}
    valores: dict[Fuente, dict[int, int]] = defaultdict(dict)
    criterio_ids = [cid for _, _, pesos in aspectos.values() for cid in pesos]
    if criterio_ids:
        filas_cal = (
            db.query(Calificacion.criterio_id, Calificacion.valor, Calificacion.estudiante_id, Calificacion.equipo_id)
            .filter(Calificacion.criterio_id.in_(criterio_ids))
            .all()
        )
        for criterio_id, valor, estudiante_id, equipo_id in filas_cal:
            fuente: Fuente = ("t", equipo_id) if equipo_id is not None else ("e", estudiante_id)
            valores[fuente][criterio_id] = valor

    # Notas por bloque de cada fuente (un equipo se calcula una sola vez)
    bloques_fuente = {f: _notas_bloque(v, aspectos) for f, v in valores.items()}

    # Nivel Criterio: {codigo: {estudiante_id: nota}}
    notas_criterio: dict[str, dict[int, Decimal]] = defaultdict(dict)
    for eid, fuentes in fuentes_est.items():
        por_codigo: dict[str, list[Decimal]] = defaultdict(list)
        for f in fuentes:
            for (_, codigo), nota in bloques_fuente.get(f, {}).items():
                por_codigo[codigo].append(nota)
        for codigo, notas in por_codigo.items():
            notas_criterio[codigo][eid] = sum(notas) / len(notas)

    # Catálogo: Criterios vinculados, sus RA padre y los Criterios hermanos
    catalogo = {
        c.codigo: c
        for c in db.query(RaAbetCatalogo).filter(RaAbetCatalogo.codigo.in_(codigos_vinculados)).all()
    }
    padres = {c.codigo_padre for c in catalogo.values() if c.codigo_padre}
    ras = {r.codigo: r for r in db.query(RaAbetCatalogo).filter(RaAbetCatalogo.codigo.in_(padres)).all()}
    hijos: dict[str, list[RaAbetCatalogo]] = defaultdict(list)
    for c in db.query(RaAbetCatalogo).filter(RaAbetCatalogo.codigo_padre.in_(padres)).all():
        hijos[c.codigo_padre].append(c)

    criterios_out = []
    for codigo in sorted(codigos_vinculados, key=_orden_codigo):
        c = catalogo[codigo]
        notas = list(notas_criterio.get(codigo, {}).values())
        conteo, sin_clasificar = _distribucion(notas, rangos)
        criterios_out.append(ReporteCriterioItem(
            codigo=codigo,
            descripcion=c.descripcion,
            codigo_padre=c.codigo_padre,
            peso=c.peso,
            rangos=conteo,
            sin_clasificar=sin_clasificar,
            total=len(notas),
        ))

    # Nivel RA: promedio ponderado por peso, renormalizado sobre los Criterios con nota
    resultados_out = []
    for ra_codigo in sorted(padres, key=_orden_codigo):
        ra = ras[ra_codigo]
        criterios_ra = sorted(hijos[ra_codigo], key=lambda c: _orden_codigo(c.codigo))
        con_evidencia = [c for c in criterios_ra if c.codigo in codigos_vinculados]
        notas_ra: list[Decimal] = []
        for eid in estudiantes:
            suma_pn = Decimal(0)
            suma_p = Decimal(0)
            for c in con_evidencia:
                nota = notas_criterio.get(c.codigo, {}).get(eid)
                if nota is not None:
                    peso = Decimal(str(c.peso))
                    suma_pn += peso * nota
                    suma_p += peso
            if suma_p > 0:
                notas_ra.append(suma_pn / suma_p)
        conteo, sin_clasificar = _distribucion(notas_ra, rangos)
        resultados_out.append(ReporteRAItem(
            codigo=ra_codigo,
            descripcion=ra.descripcion,
            rangos=conteo,
            sin_clasificar=sin_clasificar,
            total=len(notas_ra),
            criterios_con_evidencia=[c.codigo for c in con_evidencia],
            criterios_sin_evidencia=[c.codigo for c in criterios_ra if c.codigo not in codigos_vinculados],
        ))

    return ReporteABETResponse(
        curso_id=curso.id,
        curso_nombre=curso.nombre,
        curso_codigo=curso.codigo,
        periodo=curso.periodo,
        docente_email=curso.docente_email,
        rangos=rangos,
        criterios=criterios_out,
        resultados=resultados_out,
    )
