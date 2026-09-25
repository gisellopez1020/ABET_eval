import base64
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models import (
    Curso, Actividad, Seccion, EquipoTrabajo, MiembroEquipo, Estudiante,
    Calificacion, Criterio, Aspecto, RaAbetCatalogo,
)
from app.models.actividad import TipoActividad
from app.models.curso import RANGOS_CALIFICACION_DEFAULT
from app.schemas.reporte import (
    DetalleXlsxRequest, DetalleXlsxResponse, EstadoDrive, RangoReporte,
    ReporteABETResponse, ReporteActividadResponse, ReporteCriterioItem, ReporteRAItem,
)
from app.services.google_drive import subir_archivo
from app.services.reporte_excel import (
    AspectoDetalle, HojaDetalle, MIME_XLSX, libro_detalle, libro_resumen, nombre_archivo,
)

router = APIRouter(prefix="/reportes", tags=["Reportes ABET"])

CINCO = Decimal("5")
UN_DECIMAL = Decimal("0.1")

# Fuente de calificaciones: ("e", estudiante_id) o ("t", equipo_id)
Fuente = tuple[str, int]
# {aspecto_id: (actividad_id, clave de bloque, {criterio_id: peso})}
Aspectos = dict[int, tuple[int, str, dict[int, Decimal]]]


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


def _notas_bloque(valores: dict[int, int], aspectos: Aspectos) -> dict[tuple[int, str], Decimal]:
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


def _rangos_curso(curso: Curso) -> list[RangoReporte]:
    return sorted(
        (RangoReporte(**r) for r in (curso.rangos_calificacion or RANGOS_CALIFICACION_DEFAULT)),
        key=lambda r: r.minimo,
    )


def _verificar_curso(curso_id: int, usuario: dict, db: Session) -> Curso:
    curso = db.get(Curso, curso_id)
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    if curso.docente_email != usuario["email"]:
        raise HTTPException(status_code=403, detail="No tiene permiso sobre este curso")
    return curso


def _verificar_actividad(
    curso_id: int, actividad_id: int, seccion_id: Optional[int], usuario: dict, db: Session
) -> tuple[Curso, Actividad]:
    curso = _verificar_curso(curso_id, usuario, db)
    actividad = db.get(Actividad, actividad_id)
    if not actividad or actividad.curso_id != curso_id:
        raise HTTPException(status_code=404, detail="Actividad no encontrada en este curso")
    if seccion_id:
        seccion = db.get(Seccion, seccion_id)
        if not seccion or seccion.curso_id != curso_id:
            raise HTTPException(status_code=404, detail="Sección no encontrada en este curso")
    return curso, actividad


def _calcular_niveles(
    curso: Curso, db: Session, seccion_id: Optional[int], actividad_id: Optional[int] = None
) -> tuple[list[RangoReporte], list[ReporteCriterioItem], list[ReporteRAItem]]:
    """
    Distribución por estudiante en los dos niveles (Criterio y Resultado de Aprendizaje).
    Con actividad_id solo cuentan los aspectos de esa actividad; sin él, las de todo el curso.
    """
    rangos = _rangos_curso(curso)

    # Aspectos vinculados: {aspecto_id: (actividad_id, codigo_abet, {criterio_id: peso})}
    aspectos: Aspectos = {}
    q_criterios = (
        db.query(Aspecto.id, Aspecto.actividad_id, Aspecto.codigo_abet, Criterio.id, Criterio.peso_porcentaje)
        .join(Actividad, Aspecto.actividad_id == Actividad.id)
        .join(Criterio, Criterio.aspecto_id == Aspecto.id)
        .filter(Actividad.curso_id == curso.id, Aspecto.codigo_abet.isnot(None))
    )
    if actividad_id:
        q_criterios = q_criterios.filter(Aspecto.actividad_id == actividad_id)
    for aspecto_id, act_id, codigo, criterio_id, peso in q_criterios.all():
        aspectos.setdefault(aspecto_id, (act_id, codigo, {}))[2][criterio_id] = Decimal(peso)
    codigos_vinculados = {codigo for _, codigo, _ in aspectos.values()}

    # Estudiantes del curso (o de la sección filtrada)
    q_est = db.query(Estudiante.id).join(Seccion, Estudiante.seccion_id == Seccion.id).filter(
        Seccion.curso_id == curso.id
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
        .filter(Actividad.curso_id == curso.id)
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

    return rangos, criterios_out, resultados_out


def _hojas_detalle(actividad: Actividad, seccion_id: Optional[int], db: Session) -> list[HojaDetalle]:
    """
    Una hoja por equipo (grupal) o estudiante (individual) con al menos una
    calificación en la actividad, en el formato de la rúbrica del profesor.
    """
    aspectos_act = [a for a in actividad.aspectos if a.criterios]
    criterio_ids = [c.id for a in aspectos_act for c in a.criterios]

    # Bloques para _notas_bloque: los vinculados se agrupan por código; cada aspecto
    # sin vincular es su propio bloque (el Excel también les pone Nota informe)
    clave = {a.id: a.codigo_abet or f"aspecto:{a.id}" for a in aspectos_act}
    bloques: Aspectos = {
        a.id: (actividad.id, clave[a.id], {c.id: Decimal(c.peso_porcentaje) for c in a.criterios})
        for a in aspectos_act
    }

    # Entidades: (nombre de hoja, filtro de calificaciones, integrantes)
    if actividad.tipo == TipoActividad.grupal:
        q = db.query(EquipoTrabajo).filter(EquipoTrabajo.actividad_id == actividad.id)
        if seccion_id:
            q = q.filter(EquipoTrabajo.seccion_id == seccion_id)
        entidades = [
            (
                e.nombre,
                Calificacion.equipo_id == e.id,
                sorted(
                    (f"{m.estudiante.nombre_completo} ({m.estudiante.codigo_estudiante})" for m in e.miembros),
                ),
            )
            for e in q.order_by(EquipoTrabajo.nombre).all()
        ]
    else:
        q = db.query(Estudiante).join(Seccion, Estudiante.seccion_id == Seccion.id).filter(
            Seccion.curso_id == actividad.curso_id
        )
        if seccion_id:
            q = q.filter(Estudiante.seccion_id == seccion_id)
        entidades = [
            (e.nombre_completo, Calificacion.estudiante_id == e.id, [f"{e.nombre_completo} ({e.codigo_estudiante})"])
            for e in q.order_by(Estudiante.nombre_completo).all()
        ]

    hojas: list[HojaDetalle] = []
    for nombre, filtro, integrantes in entidades:
        filas = (
            db.query(Calificacion.criterio_id, Calificacion.valor, Calificacion.nota_calculada)
            .filter(filtro, Calificacion.criterio_id.in_(criterio_ids))
            .all()
            if criterio_ids else []
        )
        if not filas:
            continue
        valores = {cid: valor for cid, valor, _ in filas}
        notas = _notas_bloque(valores, bloques)
        completa = len(valores) == len(criterio_ids)
        hojas.append(HojaDetalle(
            nombre=nombre,
            aspectos=[
                AspectoDetalle(
                    clave_bloque=clave[a.id],
                    codigo_abet=a.codigo_abet,
                    nombre=a.nombre,
                    criterios=[(c.texto, valores.get(c.id)) for c in a.criterios],
                    nota=float(notas[(actividad.id, clave[a.id])]) if (actividad.id, clave[a.id]) in notas else None,
                )
                for a in aspectos_act
            ],
            nota_proyecto=float(sum(n for _, _, n in filas)) if completa else None,
            cantidad_estudiantes=len(integrantes),
            integrantes=integrantes,
        ))
    return hojas


def _content_disposition(nombre: str) -> str:
    ascii_ = nombre.encode("ascii", "ignore").decode() or "reporte.xlsx"
    return f"attachment; filename=\"{ascii_}\"; filename*=UTF-8''{quote(nombre)}"


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
    curso = _verificar_curso(curso_id, usuario, db)
    rangos, criterios, resultados = _calcular_niveles(curso, db, seccion_id)
    return ReporteABETResponse(
        curso_id=curso.id,
        curso_nombre=curso.nombre,
        curso_codigo=curso.codigo,
        periodo=curso.periodo,
        docente_email=curso.docente_email,
        rangos=rangos,
        criterios=criterios,
        resultados=resultados,
    )


@router.get(
    "/abet/{curso_id}/actividad/{actividad_id}",
    response_model=ReporteActividadResponse,
    summary="Reporte ABET de una actividad",
)
def reporte_abet_actividad(
    curso_id: int,
    actividad_id: int,
    seccion_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Mismos dos niveles que el reporte del curso, acotados a los aspectos vinculados
    de una sola actividad. En el nivel RA, `criterios_sin_evidencia` son los
    Criterios que no se vincularon en esta actividad.
    """
    curso, actividad = _verificar_actividad(curso_id, actividad_id, seccion_id, usuario, db)
    rangos, criterios, resultados = _calcular_niveles(curso, db, seccion_id, actividad_id)
    return ReporteActividadResponse(
        curso_id=curso.id,
        curso_nombre=curso.nombre,
        curso_codigo=curso.codigo,
        periodo=curso.periodo,
        docente_email=curso.docente_email,
        actividad_id=actividad.id,
        actividad_nombre=actividad.nombre,
        actividad_tipo=actividad.tipo.value,
        rangos=rangos,
        criterios=criterios,
        resultados=resultados,
    )


@router.get(
    "/abet/{curso_id}/actividad/{actividad_id}/resumen-xlsx",
    summary="Resumen en Excel (hoja Conteo) de una actividad",
    response_class=Response,
)
def resumen_xlsx(
    curso_id: int,
    actividad_id: int,
    seccion_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """Libro con la hoja "Conteo": una fila por Criterio ABET y una torta por fila. No toca Drive."""
    curso, actividad = _verificar_actividad(curso_id, actividad_id, seccion_id, usuario, db)
    rangos, criterios, _ = _calcular_niveles(curso, db, seccion_id, actividad_id)
    nombre = nombre_archivo(curso, actividad, "resumen")
    return Response(
        content=libro_resumen(rangos, criterios),
        media_type=MIME_XLSX,
        headers={"Content-Disposition": _content_disposition(nombre)},
    )


@router.post(
    "/abet/{curso_id}/actividad/{actividad_id}/detalle-xlsx",
    response_model=DetalleXlsxResponse,
    summary="Detalle en Excel de una actividad, sincronizado con Google Drive",
)
def detalle_xlsx(
    curso_id: int,
    actividad_id: int,
    body: DetalleXlsxRequest,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Genera la hoja "Conteo" más una hoja por equipo o estudiante calificado y la
    sube a la carpeta de Drive del docente. El archivo se devuelve siempre (en
    base64); `drive.estado` indica si la sincronización fue real, simulada
    (SKIP_AUTH) o falló.
    """
    curso, actividad = _verificar_actividad(curso_id, actividad_id, body.seccion_id, usuario, db)
    rangos, criterios, _ = _calcular_niveles(curso, db, body.seccion_id, actividad_id)
    contenido = libro_detalle(rangos, criterios, _hojas_detalle(actividad, body.seccion_id, db))
    nombre = nombre_archivo(curso, actividad, "detalle")
    drive = subir_archivo(usuario["email"], nombre, contenido, MIME_XLSX)
    return DetalleXlsxResponse(
        nombre_archivo=nombre,
        archivo_base64=base64.b64encode(contenido).decode(),
        drive=EstadoDrive(**drive),
    )
