"""
Reglas de negocio de la rúbrica de una actividad (aspectos y criterios) y de su vínculo
con los Criterios del catálogo ABET. Lanza errores de app/services/errores.py (nunca
HTTPException) y es dueño de la transacción: hace commit al terminar cada operación.

Reemplazar la rúbrica (o leerla de un Excel para reemplazarla) se bloquea si la
actividad ya tiene calificaciones; cambiar solo el vínculo ABET de un aspecto no,
a propósito: no reconstruye la rúbrica.
"""
from decimal import Decimal
from typing import Iterable, List, Optional

from sqlalchemy.orm import Session

from app.models import Actividad, Aspecto, Criterio
from app.repositories.actividad import ActividadRepository
from app.repositories.calificacion import CalificacionRepository
from app.repositories.curso import CursoRepository
from app.repositories.ra_abet import RaAbetRepository
from app.repositories.rubrica import RubricaRepository
from app.schemas.criterio import AspectoIn, AspectoOut, CriteriosResponse
from app.schemas.curso import MAX_RA_ABET
from app.services.acceso import actividad_del_docente
from app.services.errores import (
    AspectoNoEncontrado, CodigoAbetDesconocido, CodigoAbetEsResultado, LimiteRaAbetCurso,
    PesosRubricaInvalidos, RubricaConCalificaciones, RubricaExcelInvalida,
)
from app.utils.excel_parser import ExcelParserError, parsear_excel_criterios


class CriterioService:
    def __init__(self, db: Session):
        self.db = db
        self.actividades = ActividadRepository(db)
        self.cursos = CursoRepository(db)
        self.rubrica = RubricaRepository(db)

    def obtener(self, actividad_id: int, docente_email: str) -> CriteriosResponse:
        """
        Criterios agrupados por aspecto con el total de pesos. `tiene_calificaciones`
        indica que la rúbrica ya no se puede reemplazar (solo cambiar sus vínculos ABET).
        """
        actividad = actividad_del_docente(self.actividades, self.cursos, actividad_id, docente_email)
        return CriteriosResponse(
            aspectos=[AspectoOut.model_validate(a) for a in actividad.aspectos],
            total_peso=sum(c.peso_porcentaje for a in actividad.aspectos for c in a.criterios),
            tiene_calificaciones=CalificacionRepository(self.db).existen_para_actividad(actividad_id),
        )

    def reemplazar(self, actividad_id: int, docente_email: str, aspectos: List[AspectoIn]) -> CriteriosResponse:
        """
        Reemplaza completamente los aspectos y criterios. Valida, en este orden y antes
        de escribir nada: que no haya calificaciones, que los pesos sumen exactamente 100
        y los vínculos ABET (incluido el máximo de RA del curso). El RA padre de cada
        vínculo se agrega al ra_abet del curso si falta.
        """
        actividad = actividad_del_docente(self.actividades, self.cursos, actividad_id, docente_email)
        self._sin_calificaciones(actividad)

        total_peso = sum(c.peso_porcentaje for aspecto in aspectos for c in aspecto.criterios)
        if total_peso != Decimal("100"):
            raise PesosRubricaInvalidos(total_peso)

        codigos_ra = self._validar_codigos_abet(a.codigo_abet for a in aspectos)
        self._agregar_ra_al_curso(actividad, codigos_ra)

        self.rubrica.eliminar_aspectos_de(actividad)
        nuevos_aspectos = []
        for orden_asp, asp_in in enumerate(aspectos):
            aspecto = self.rubrica.agregar_aspecto(Aspecto(
                nombre=asp_in.nombre,
                actividad_id=actividad_id,
                orden=asp_in.orden if asp_in.orden else orden_asp,
                codigo_abet=asp_in.codigo_abet,
            ))
            for orden_crit, crit_in in enumerate(asp_in.criterios):
                self.rubrica.agregar_criterio(Criterio(
                    texto=crit_in.texto,
                    peso_porcentaje=crit_in.peso_porcentaje,
                    aspecto_id=aspecto.id,
                    orden=crit_in.orden if crit_in.orden else orden_crit,
                ))
            nuevos_aspectos.append(aspecto)

        self.db.commit()
        # Refrescar para obtener los criterios con sus IDs
        for aspecto in nuevos_aspectos:
            self.db.refresh(aspecto)
        return CriteriosResponse(
            aspectos=[AspectoOut.model_validate(a) for a in nuevos_aspectos], total_peso=total_peso,
        )

    def leer_excel(self, actividad_id: int, docente_email: str, contenido: bytes) -> dict:
        """
        Rúbrica leída de un .xlsx (Aspecto | Criterio | %Criterio), sin guardarla: el
        docente la revisa y la confirma con `reemplazar`. Se bloquea igual que reemplazar
        si la actividad ya tiene calificaciones. Los aspectos llegan sin codigo_abet.
        """
        actividad = actividad_del_docente(self.actividades, self.cursos, actividad_id, docente_email)
        self._sin_calificaciones(actividad)
        try:
            return parsear_excel_criterios(contenido)
        except ExcelParserError as exc:
            raise RubricaExcelInvalida(str(exc)) from exc

    def vincular_codigo_abet(
        self, actividad_id: int, aspecto_id: int, docente_email: str, codigo_abet: Optional[str],
    ) -> Aspecto:
        """
        Cambia solo el vínculo ABET del aspecto, sin reconstruir la rúbrica: se permite
        aunque la actividad ya tenga calificaciones. None lo desvincula. El RA padre se
        agrega al ra_abet del curso si falta.
        """
        actividad = actividad_del_docente(self.actividades, self.cursos, actividad_id, docente_email)
        aspecto = self.rubrica.get_aspecto(aspecto_id)
        if not aspecto or aspecto.actividad_id != actividad_id:
            raise AspectoNoEncontrado()

        codigos_ra = self._validar_codigos_abet([codigo_abet])
        self._agregar_ra_al_curso(actividad, codigos_ra)
        aspecto.codigo_abet = codigo_abet
        self.db.commit()
        self.db.refresh(aspecto)
        return aspecto

    def _sin_calificaciones(self, actividad: Actividad) -> None:
        """Reemplazar la rúbrica borraría en cascada las calificaciones ya registradas."""
        if CalificacionRepository(self.db).existen_para_actividad(actividad.id):
            raise RubricaConCalificaciones(actividad.nombre)

    def _validar_codigos_abet(self, codigos: Iterable[Optional[str]]) -> List[str]:
        """
        Cada codigo_abet debe existir en el catálogo y ser un Criterio (tener codigo_padre),
        no un Resultado de Aprendizaje. Devuelve los códigos de los RA padre (sin repetir).
        """
        codigos = [c for c in dict.fromkeys(codigos) if c]
        if not codigos:
            return []
        padres = RaAbetRepository(self.db).padres_de(codigos)
        for codigo in codigos:
            if codigo not in padres:
                raise CodigoAbetDesconocido(codigo)
            if padres[codigo] is None:
                raise CodigoAbetEsResultado(codigo)
        return list(dict.fromkeys(padres[c] for c in codigos))

    def _agregar_ra_al_curso(self, actividad: Actividad, codigos_ra: List[str]) -> None:
        """
        Agrega al ra_abet del curso los RA padre que falten (no se exige configurarlos antes).
        Conserva lo que ya haya, incluidos valores antiguos, y respeta el máximo de RA por curso.
        Modifica el curso sin hacer commit: lo confirma la operación que la llama.
        """
        curso = self.cursos.get(actividad.curso_id)
        actual = list(curso.ra_abet or [])
        faltantes = [c for c in codigos_ra if c not in actual]
        if not faltantes:
            return
        if len(actual) + len(faltantes) > MAX_RA_ABET:
            raise LimiteRaAbetCurso(faltantes, curso.nombre, len(actual), MAX_RA_ABET)
        # Asignar una lista nueva: SQLAlchemy no detecta mutaciones en sitio de una columna JSON
        curso.ra_abet = actual + faltantes
