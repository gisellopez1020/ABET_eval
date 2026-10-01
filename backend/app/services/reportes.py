"""
Reportes ABET de un curso o de una actividad, y sus libros de Excel. Verifica el acceso,
consulta los datos y arma los reportes con las reglas de services/calculo_reportes.py.
Lanza errores de app/services/errores.py (nunca HTTPException) y no escribe en la BD.

El libro de detalle se sube a Google Drive con services/google_drive.subir_archivo, que
nunca lanza: su resultado viaja con el archivo.
"""
from collections import defaultdict
from decimal import Decimal
from functools import partial
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Actividad, Curso, RaAbetCatalogo, Seccion
from app.models.actividad import TipoActividad
from app.repositories.actividad import ActividadRepository
from app.repositories.calificacion import CalificacionRepository
from app.repositories.curso import CursoRepository
from app.repositories.equipo import EquipoRepository
from app.repositories.estudiante import EstudianteRepository
from app.repositories.ra_abet import RaAbetRepository
from app.repositories.rubrica import RubricaRepository
from app.repositories.seccion import SeccionRepository
from app.schemas.reporte import (
    RangoReporte, ReporteABETResponse, ReporteActividadResponse, ReporteCriterioItem, ReporteRAItem,
)
from app.services.acceso import curso_del_docente, seccion_del_curso
from app.services.calculo_reportes import (
    Aspectos, Fuente, distribucion, notas_bloque, orden_codigo, rangos_curso,
)
from app.services.errores import ActividadFueraDelCurso
from app.services.google_drive import subir_archivo
from app.services.reporte_excel import (
    AspectoDetalle, HojaDetalle, MIME_XLSX, libro_detalle, libro_resumen, nombre_archivo,
)


class ReporteService:
    def __init__(self, db: Session):
        self.db = db
        self.cursos = CursoRepository(db)
        self.actividades = ActividadRepository(db)
        self.secciones = SeccionRepository(db)

    def reporte_curso(self, curso_id: int, docente_email: str, seccion_id: Optional[int]) -> ReporteABETResponse:
        """
        Reporte ABET del curso en dos niveles, contando por estudiante. seccion_id solo
        filtra a los estudiantes: no se valida (una sección de otro curso deja los totales en 0).
        """
        curso = curso_del_docente(self.cursos, curso_id, docente_email)
        rangos, criterios, resultados = self._calcular_niveles(curso, seccion_id)
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

    def reporte_actividad(
        self, curso_id: int, actividad_id: int, docente_email: str, seccion_id: Optional[int],
    ) -> ReporteActividadResponse:
        """Los mismos dos niveles, acotados a los aspectos vinculados de una sola actividad."""
        curso, actividad, _ = self._verificar_actividad(curso_id, actividad_id, seccion_id, docente_email)
        rangos, criterios, resultados = self._calcular_niveles(curso, seccion_id, actividad_id)
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

    def resumen_xlsx(
        self, curso_id: int, actividad_id: int, docente_email: str, seccion_id: Optional[int],
    ) -> tuple[bytes, str]:
        """(libro con la hoja "Conteo", nombre de archivo). No toca Drive."""
        curso, actividad, seccion = self._verificar_actividad(curso_id, actividad_id, seccion_id, docente_email)
        rangos, criterios, _ = self._calcular_niveles(curso, seccion_id, actividad_id)
        return libro_resumen(rangos, criterios), nombre_archivo(curso, actividad, "resumen", seccion)

    def detalle_xlsx(
        self, curso_id: int, actividad_id: int, docente_email: str, seccion_id: Optional[int],
    ) -> tuple[bytes, str, dict]:
        """
        (libro con "Conteo" y una hoja por equipo o estudiante calificado, nombre de
        archivo, resultado de la subida a Drive). Drive se llama solo si la verificación
        pasó; su resultado indica si la sincronización fue real, simulada o falló.
        """
        curso, actividad, seccion = self._verificar_actividad(curso_id, actividad_id, seccion_id, docente_email)
        rangos, criterios, _ = self._calcular_niveles(curso, seccion_id, actividad_id)
        contenido = libro_detalle(rangos, criterios, self._hojas_detalle(actividad, seccion_id))
        nombre = nombre_archivo(curso, actividad, "detalle", seccion)
        drive = subir_archivo(docente_email, nombre, contenido, MIME_XLSX)
        return contenido, nombre, drive

    def _verificar_actividad(
        self, curso_id: int, actividad_id: int, seccion_id: Optional[int], email: str,
    ) -> tuple[Curso, Actividad, Optional[Seccion]]:
        """Valida curso, actividad y sección (si se filtró). La sección es None sin filtro."""
        curso = curso_del_docente(self.cursos, curso_id, email)
        actividad = self.actividades.get(actividad_id)
        if not actividad or actividad.curso_id != curso_id:
            raise ActividadFueraDelCurso()
        seccion = None
        if seccion_id:
            seccion = seccion_del_curso(self.secciones, seccion_id, curso_id)
        return curso, actividad, seccion

    def _calcular_niveles(
        self, curso: Curso, seccion_id: Optional[int], actividad_id: Optional[int] = None,
    ) -> tuple[list[RangoReporte], list[ReporteCriterioItem], list[ReporteRAItem]]:
        """
        Distribución por estudiante en los dos niveles (Criterio y Resultado de Aprendizaje).
        Con actividad_id solo cuentan los aspectos de esa actividad; sin él, las de todo el curso.
        """
        rangos = rangos_curso(curso)

        # Aspectos vinculados: {aspecto_id: (actividad_id, codigo_abet, {criterio_id: peso})}
        aspectos: Aspectos = {}
        for aspecto_id, act_id, codigo, criterio_id, peso in RubricaRepository(self.db).criterios_vinculados(
            curso.id, actividad_id
        ):
            aspectos.setdefault(aspecto_id, (act_id, codigo, {}))[2][criterio_id] = Decimal(peso)
        codigos_vinculados = {codigo for _, codigo, _ in aspectos.values()}

        # Estudiantes del curso (o de la sección filtrada)
        estudiantes = EstudianteRepository(self.db).ids_de_curso(curso.id, seccion_id)

        # Fuentes de cada estudiante: sus calificaciones propias y las de sus equipos
        fuentes_est: dict[int, list[Fuente]] = {eid: [("e", eid)] for eid in estudiantes}
        for eid, equipo_id in EquipoRepository(self.db).membresias_de_curso(curso.id):
            if eid in fuentes_est:
                fuentes_est[eid].append(("t", equipo_id))

        # Valores calificados por fuente: {fuente: {criterio_id: valor}}
        valores: dict[Fuente, dict[int, int]] = defaultdict(dict)
        criterio_ids = [cid for _, _, pesos in aspectos.values() for cid in pesos]
        if criterio_ids:
            filas_cal = CalificacionRepository(self.db).valores_por_criterios(criterio_ids)
            for criterio_id, valor, estudiante_id, equipo_id in filas_cal:
                fuente: Fuente = ("t", equipo_id) if equipo_id is not None else ("e", estudiante_id)
                valores[fuente][criterio_id] = valor

        # Notas por bloque de cada fuente (un equipo se calcula una sola vez)
        bloques_fuente = {f: notas_bloque(v, aspectos) for f, v in valores.items()}

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
        ra_abet = RaAbetRepository(self.db)
        catalogo = {c.codigo: c for c in ra_abet.por_codigos(codigos_vinculados)}
        padres = {c.codigo_padre for c in catalogo.values() if c.codigo_padre}
        ras = {r.codigo: r for r in ra_abet.por_codigos(padres)}
        hijos: dict[str, list[RaAbetCatalogo]] = defaultdict(list)
        for c in ra_abet.hijos_de(padres):
            hijos[c.codigo_padre].append(c)

        criterios_out = []
        for codigo in sorted(codigos_vinculados, key=orden_codigo):
            c = catalogo[codigo]
            notas = list(notas_criterio.get(codigo, {}).values())
            conteo, sin_clasificar = distribucion(notas, rangos)
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
        for ra_codigo in sorted(padres, key=orden_codigo):
            ra = ras[ra_codigo]
            criterios_ra = sorted(hijos[ra_codigo], key=lambda c: orden_codigo(c.codigo))
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
            conteo, sin_clasificar = distribucion(notas_ra, rangos)
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

    def _hojas_detalle(self, actividad: Actividad, seccion_id: Optional[int]) -> list[HojaDetalle]:
        """
        Una hoja por equipo (grupal) o estudiante (individual) con al menos una
        calificación en la actividad, en el formato de la rúbrica del profesor.
        """
        aspectos_act = [a for a in actividad.aspectos if a.criterios]
        criterio_ids = [c.id for a in aspectos_act for c in a.criterios]

        # Bloques para notas_bloque: los vinculados se agrupan por código; cada aspecto
        # sin vincular es su propio bloque (el Excel también les pone Nota informe)
        clave = {a.id: a.codigo_abet or f"aspecto:{a.id}" for a in aspectos_act}
        bloques: Aspectos = {
            a.id: (actividad.id, clave[a.id], {c.id: Decimal(c.peso_porcentaje) for c in a.criterios})
            for a in aspectos_act
        }

        # Entidades: (nombre de hoja, lector de sus calificaciones, integrantes)
        calificaciones = CalificacionRepository(self.db)
        if actividad.tipo == TipoActividad.grupal:
            entidades = [
                (
                    e.nombre,
                    partial(calificaciones.valores_de_equipo, e.id),
                    sorted(
                        (f"{m.estudiante.nombre_completo} ({m.estudiante.codigo_estudiante})" for m in e.miembros),
                    ),
                )
                for e in EquipoRepository(self.db).de_actividad_ordenados(actividad.id, seccion_id)
            ]
        else:
            entidades = [
                (
                    e.nombre_completo,
                    partial(calificaciones.valores_de_estudiante, e.id),
                    [f"{e.nombre_completo} ({e.codigo_estudiante})"],
                )
                for e in EstudianteRepository(self.db).de_curso(actividad.curso_id, seccion_id)
            ]

        hojas: list[HojaDetalle] = []
        for nombre, leer_valores, integrantes in entidades:
            filas = leer_valores(criterio_ids) if criterio_ids else []
            if not filas:
                continue
            valores = {cid: valor for cid, valor, _ in filas}
            notas = notas_bloque(valores, bloques)
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
