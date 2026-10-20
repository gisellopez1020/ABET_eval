"""
Reglas de negocio del catálogo RA ABET. Los catálogos son compartidos por todos los
docentes y se aíslan por programa, así que aquí no hay verificación de propiedad.

Dos niveles: Resultado de Aprendizaje (codigo_padre NULL) y Criterio (codigo_padre -> RA).
Los pesos de los Criterios de un RA no tienen que sumar 1.0 (solo es una advertencia
en el frontend).

Lanza errores de app/services/errores.py (nunca HTTPException) y es dueño de la
transacción: hace commit al terminar cada operación, y la importación hace rollback
si algo falla mientras escribe.
"""
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models import RaAbetCatalogo
from app.models.ra_abet_catalogo import PROGRAMA_DEFAULT
from app.repositories.curso import CursoRepository
from app.repositories.ra_abet import RaAbetRepository
from app.repositories.rubrica import RubricaRepository
from app.schemas import RaAbetCreate, RaAbetImportResultado
from app.services.errores import (
    CambioDeNivel, CodigoConCriterios, CodigoDuplicado, CodigoEnUsoPorCursos, CodigoNoEncontrado,
    CodigoVinculadoAAspectos, ImportacionInvalida, PadreEsCriterio, PadreInexistente,
)


class CatalogoService:
    def __init__(self, db: Session):
        self.db = db
        self.ra_abet = RaAbetRepository(db)

    def listar(self, solo_raiz: bool = False, programa: Optional[str] = None) -> List[RaAbetCatalogo]:
        """El catálogo ordenado por código; con solo_raiz, solo los Resultados de Aprendizaje."""
        return self.ra_abet.listar(solo_raiz, programa)

    def crear(self, datos: Dict[str, Any]) -> RaAbetCatalogo:
        """Un Criterio (con codigo_padre y peso) sin competencia hereda la de su RA."""
        programa = datos.get("programa", PROGRAMA_DEFAULT)
        datos["programa"] = programa
        if self.ra_abet.get(datos["codigo"], programa):
            raise CodigoDuplicado(datos["codigo"])
        if datos.get("codigo_padre") is not None:
            padre = self._validar_padre(datos["codigo_padre"], programa)
            datos = {**datos, "competencia": datos.get("competencia") or padre.competencia}
        ra = self.ra_abet.agregar(RaAbetCatalogo(**datos))
        self.db.commit()
        self.db.refresh(ra)
        return ra

    def importar(self, items: List[RaAbetCreate]) -> RaAbetImportResultado:
        """
        Crea los códigos nuevos y actualiza los existentes dentro de su programa en una sola transacción: si
        algo falla no se guarda nada. Primero procesa los Resultados de Aprendizaje y
        luego los Criterios, sin importar el orden del archivo.
        """
        programas = {item.programa for item in items}
        existentes = {programa: self.ra_abet.por_codigo(programa) for programa in programas}
        archivo = {(item.programa, item.codigo): item for item in items}

        # 1. Validar el estado final completo. Solo lee: si falla, no hay nada que deshacer
        errores = self._errores_de_importacion(items, existentes, archivo)
        if errores:
            raise ImportacionInvalida(errores)

        # 2. Escribir: raíces -> flush -> criterios -> flush -> commit, todo o nada.
        # Si algo lanza (también una regla de negocio que se agregue aquí), rollback antes de propagar
        raices = [item for item in items if item.codigo_padre is None]
        criterios = [item for item in items if item.codigo_padre is not None]
        creados = actualizados = 0
        try:
            for grupo in (raices, criterios):
                for item in grupo:
                    datos = item.model_dump(exclude={"codigo"}, exclude_unset=True)
                    if item.codigo_padre is not None and not item.competencia:
                        datos["competencia"] = self._competencia_final(item, existentes, archivo)
                    existente = existentes[item.programa].get(item.codigo)
                    if existente:
                        # Solo los campos enviados: no pisar p. ej. el programa con su valor por defecto
                        for campo, valor in datos.items():
                            setattr(existente, campo, valor)
                        actualizados += 1
                    else:
                        self.ra_abet.agregar(
                            RaAbetCatalogo(
                                codigo=item.codigo,
                                **{**item.model_dump(exclude={"codigo"}), **datos},
                            )
                        )
                        creados += 1
                # Los RA deben existir en la BD antes de insertar Criterios que los referencian (FK)
                self.ra_abet.flush()
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return RaAbetImportResultado(creados=creados, actualizados=actualizados)

    def editar(
        self, codigo: str, cambios: Dict[str, Any], programa: str = PROGRAMA_DEFAULT,
    ) -> RaAbetCatalogo:
        """
        Aplica los campos de `cambios`. El código no es editable y no se puede cambiar
        de nivel; un Criterio sí puede cambiar de peso o moverse a otro RA.
        """
        ra = self._obtener(codigo, programa)
        if cambios.get("programa", programa) != programa:
            raise ImportacionInvalida(["un resultado no puede moverse a otra colección"])
        if "codigo_padre" in cambios:
            nuevo_padre = cambios["codigo_padre"]
            if (ra.codigo_padre is None) != (nuevo_padre is None):
                raise CambioDeNivel(codigo)
            if nuevo_padre is not None:
                self._validar_padre(nuevo_padre, programa)
        for campo, valor in cambios.items():
            setattr(ra, campo, valor)
        self.db.commit()
        self.db.refresh(ra)
        return ra

    def eliminar(self, codigo: str, programa: str = PROGRAMA_DEFAULT) -> None:
        """
        Solo si no tiene Criterios hijos, ningún curso (de cualquier docente) lo tiene en
        su ra_abet y ningún aspecto de rúbrica está vinculado a él; se revisa en ese orden.
        """
        ra = self._obtener(codigo, programa)
        hijos = self.ra_abet.contar_hijos(codigo, programa)
        if hijos:
            raise CodigoConCriterios(codigo, hijos)
        en_uso = CursoRepository(self.db).contar_que_usan_ra(codigo, programa)
        if en_uso:
            raise CodigoEnUsoPorCursos(codigo, en_uso)
        aspectos = RubricaRepository(self.db).contar_aspectos_con_codigo(codigo, programa)
        if aspectos:
            raise CodigoVinculadoAAspectos(codigo, aspectos)
        self.ra_abet.eliminar(ra)
        self.db.commit()

    def _obtener(self, codigo: str, programa: str) -> RaAbetCatalogo:
        ra = self.ra_abet.get(codigo, programa)
        if not ra:
            raise CodigoNoEncontrado(codigo)
        return ra

    def _validar_padre(self, codigo_padre: str, programa: str) -> RaAbetCatalogo:
        """El padre debe existir y ser un Resultado de Aprendizaje (solo 2 niveles, nunca 3)."""
        padre = self.ra_abet.get(codigo_padre, programa)
        if not padre:
            raise PadreInexistente(codigo_padre)
        if padre.codigo_padre is not None:
            raise PadreEsCriterio(codigo_padre)
        return padre

    @staticmethod
    def _errores_de_importacion(
        items: List[RaAbetCreate],
        existentes: Dict[str, Dict[str, RaAbetCatalogo]],
        archivo: Dict[tuple[str, str], RaAbetCreate],
    ) -> List[str]:
        """Motivos por los que el estado final de la importación sería inválido (vacío si ninguno)."""

        def padre_final(programa: str, codigo: str) -> Optional[str]:
            """Nivel de un código tras la importación: el del archivo si viene, si no el de la BD."""
            key = (programa, codigo)
            return (
                archivo[key].codigo_padre
                if key in archivo
                else existentes[programa][codigo].codigo_padre
            )

        errores: List[str] = []
        for item in items:
            existente = existentes[item.programa].get(item.codigo)
            if existente and (existente.codigo_padre is None) != (item.codigo_padre is None):
                errores.append(f"'{item.codigo}' cambiaría de nivel (Resultado de Aprendizaje <-> Criterio)")
            if item.codigo_padre is not None:
                key = (item.programa, item.codigo_padre)
                if key not in archivo and item.codigo_padre not in existentes[item.programa]:
                    errores.append(f"el RA padre '{item.codigo_padre}' de '{item.codigo}' no existe")
                elif padre_final(item.programa, item.codigo_padre) is not None:
                    errores.append(
                        f"el padre '{item.codigo_padre}' de '{item.codigo}' es un Criterio "
                        "(solo se permiten 2 niveles)"
                    )
        return errores

    @staticmethod
    def _competencia_final(
        item: RaAbetCreate,
        existentes: Dict[str, Dict[str, RaAbetCatalogo]],
        archivo: Dict[tuple[str, str], RaAbetCreate],
    ) -> str:
        """Competencia de un RA tras la importación: la del archivo si trae, si no la de la BD."""
        padre_key = (item.programa, item.codigo_padre or "")
        if padre_key in archivo and archivo[padre_key].competencia:
            return archivo[padre_key].competencia or ""
        return existentes[item.programa][item.codigo_padre or ""].competencia
