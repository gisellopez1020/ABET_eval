"""
Reglas de negocio de los estudiantes de una sección: listado con promedio, alta y
edición manual (con la regla del correo), eliminación, importación y vista previa
de listas, y exportación a Excel. Lanza errores de app/services/errores.py (nunca
HTTPException) y es dueño de la transacción: hace commit al terminar cada operación.

La lectura de los archivos vive en services/lista_estudiantes.py (sin BD) y el armado
del libro exportado en services/exportar_estudiantes.py.
"""
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models import Curso, Estudiante, Seccion
from app.repositories.curso import CursoRepository
from app.repositories.estudiante import EstudianteRepository
from app.repositories.seccion import SeccionRepository
from app.schemas import EstudianteListadoOut, EstudianteOut
from app.schemas.estudiante import EstudianteOmitido, VistaPreviaEstudiantes
from app.services.errores import (
    AsignaturaNoEncontrada, CodigoEstudianteRepetido, EstudianteNoEncontrado, SeccionFueraDeAsignatura,
    SeccionNoEncontrada, SinPermiso,
)
from app.services.exportar_estudiantes import FilaEstudiante, libro_estudiantes, nombre_archivo_estudiantes
from app.services.lista_estudiantes import (
    EnSeccion, clave_nombre, leer_lista_con_filas, normalizar_codigo, normalizar_email, separar_repetidos,
)
from app.services.notas import promedios_estudiantes


@dataclass(frozen=True)
class EstudianteConAviso:
    """
    Resultado del alta o la edición. La operación se hizo; `aviso` explica qué pasó
    con un correo no válido (no es un error: no la impidió).
    """
    estudiante: Estudiante
    aviso: Optional[str] = None


@dataclass(frozen=True)
class ResultadoImportacion:
    importados: int
    avisos: List[str]
    # Filas con un código que ya estaba en la sección o repetido en el archivo
    omitidos: int = 0


class EstudianteService:
    def __init__(self, db: Session):
        self.db = db
        self.cursos = CursoRepository(db)
        self.secciones = SeccionRepository(db)
        self.estudiantes = EstudianteRepository(db)

    def listar(self, seccion_id: int, docente_email: str) -> List[EstudianteListadoOut]:
        """
        Estudiantes de la sección con su promedio ponderado sobre las actividades
        calificadas del curso (ver services/notas.py).
        """
        seccion = self._seccion_del_docente(seccion_id, docente_email)
        estudiantes = self.estudiantes.de_seccion(seccion_id)
        promedios = promedios_estudiantes(self.db, seccion.curso_id, [e.id for e in estudiantes])
        return [
            EstudianteListadoOut(
                **EstudianteOut.model_validate(e).model_dump(),
                promedio=float(promedios[e.id]) if promedios[e.id] is not None else None,
            )
            for e in estudiantes
        ]

    def agregar(
        self, seccion_id: int, docente_email: str, nombre: str, codigo: str, email: Optional[str],
    ) -> EstudianteConAviso:
        """
        Un correo sin formato de correo no impide el alta: queda en blanco y se avisa.
        Un código que ya tiene otro estudiante de la sección sí la impide
        (CodigoEstudianteRepetido); el mismo nombre con otro código solo se avisa.
        """
        self._seccion_del_docente(seccion_id, docente_email)
        nombre_final, codigo_final = nombre.strip().upper(), codigo.strip()
        self.secciones.bloquear(seccion_id)
        en_seccion = self.estudiantes.codigos_y_nombres(seccion_id)
        self._sin_codigo_repetido(codigo_final, en_seccion)

        email_normalizado, email_invalido = normalizar_email(email)
        estudiante = self.estudiantes.agregar(Estudiante(
            nombre_completo=nombre_final,
            codigo_estudiante=codigo_final,
            email=email_normalizado,
            seccion_id=seccion_id,
        ))
        self.db.commit()
        self.db.refresh(estudiante)
        avisos = [f"El correo '{email.strip()}' no es válido, se dejó en blanco"] if email_invalido else []
        avisos += self._aviso_mismo_nombre(nombre_final, en_seccion)
        return EstudianteConAviso(estudiante, "; ".join(avisos) or None)

    def editar(self, estudiante_id: int, docente_email: str, cambios: Dict[str, Any]) -> EstudianteConAviso:
        """
        Aplica solo los campos de `cambios` (nombre_completo, codigo_estudiante, email).
        No toca la sección, los equipos ni las calificaciones. El correo se normaliza
        como en el alta (None o vacío lo borra); uno sin formato de correo no bloquea
        la edición: se conserva el que había (en blanco si no había) y se avisa.
        Cambiar el código al de otro estudiante de la sección no se permite
        (CodigoEstudianteRepetido); cambiar el nombre al de otro solo se avisa.
        """
        estudiante = self._estudiante_del_docente(estudiante_id, docente_email, "editar")

        cambia_codigo = "codigo_estudiante" in cambios and (
            normalizar_codigo(cambios["codigo_estudiante"]) != normalizar_codigo(estudiante.codigo_estudiante)
        )
        cambia_nombre = "nombre_completo" in cambios and (
            clave_nombre(cambios["nombre_completo"]) != clave_nombre(estudiante.nombre_completo)
        )
        otros = []
        if cambia_codigo or cambia_nombre:
            self.secciones.bloquear(estudiante.seccion_id)
            otros = [e for e in self.estudiantes.codigos_y_nombres(estudiante.seccion_id) if e[0] != estudiante.id]
        if cambia_codigo:
            self._sin_codigo_repetido(cambios["codigo_estudiante"], otros)

        if "nombre_completo" in cambios:
            estudiante.nombre_completo = cambios["nombre_completo"].upper()
        if "codigo_estudiante" in cambios:
            estudiante.codigo_estudiante = cambios["codigo_estudiante"]

        avisos: List[str] = []
        if "email" in cambios:
            email, email_invalido = normalizar_email(cambios["email"])
            if email_invalido:
                # Un error de tipeo no debe borrar un correo bueno que ya estaba
                avisos.append(f"El correo '{cambios['email'].strip()}' no es válido, " + (
                    "se conservó el anterior" if estudiante.email else "se dejó en blanco"
                ))
            else:
                estudiante.email = email
        if cambia_nombre:
            avisos += self._aviso_mismo_nombre(estudiante.nombre_completo, otros)

        self.db.commit()
        self.db.refresh(estudiante)
        return EstudianteConAviso(estudiante, "; ".join(avisos) or None)

    def eliminar(self, estudiante_id: int, docente_email: str) -> None:
        """Elimina al estudiante y, en cascada, sus calificaciones individuales."""
        estudiante = self._estudiante_del_docente(estudiante_id, docente_email, "eliminar")
        self.estudiantes.eliminar(estudiante)
        self.db.commit()

    def importar(
        self, seccion_id: int, docente_email: str,
        contenido: bytes, nombre_archivo: Optional[str], content_type: Optional[str],
    ) -> ResultadoImportacion:
        """
        Guarda los estudiantes válidos del archivo (ver lista_estudiantes.leer_lista).
        Un archivo inválido no guarda nada; los problemas de una fila quedan como avisos.
        Las filas con un código que ya está en la sección, o en una fila anterior del
        archivo, se omiten con un aviso (lista_estudiantes.separar_repetidos). La
        comprobación y el guardado van en la misma transacción, con la sección bloqueada.
        """
        seccion = self._seccion_del_docente(seccion_id, docente_email)
        validos, avisos = leer_lista_con_filas(contenido, nombre_archivo, content_type, seccion.nombre)
        self.secciones.bloquear(seccion_id)
        a_importar, omitidos, avisos_repetidos = self._separar(seccion_id, validos)
        self.estudiantes.agregar_varios([
            Estudiante(nombre_completo=nombre, codigo_estudiante=codigo, email=email, seccion_id=seccion_id)
            for nombre, codigo, email in a_importar
        ])
        self.db.commit()
        return ResultadoImportacion(
            importados=len(a_importar), avisos=avisos + avisos_repetidos, omitidos=len(omitidos),
        )

    def vista_previa(
        self, seccion_id: int, docente_email: str,
        contenido: bytes, nombre_archivo: Optional[str], content_type: Optional[str],
    ) -> VistaPreviaEstudiantes:
        """Lo que importaría `importar` con el mismo archivo, sin guardar nada (con los omitidos)."""
        seccion = self._seccion_del_docente(seccion_id, docente_email)
        validos, avisos = leer_lista_con_filas(contenido, nombre_archivo, content_type, seccion.nombre)
        a_importar, omitidos, avisos_repetidos = self._separar(seccion_id, validos)
        return VistaPreviaEstudiantes(
            estudiantes=[{"nombre": n, "codigo": c, "email": e} for n, c, e in a_importar],
            errores=avisos + avisos_repetidos,
            omitidos=[EstudianteOmitido(**o.__dict__) for o in omitidos],
        )

    def _separar(self, seccion_id: int, validos):
        en_seccion = [EnSeccion(codigo, nombre) for _, codigo, nombre in self.estudiantes.codigos_y_nombres(seccion_id)]
        return separar_repetidos(validos, en_seccion)

    @staticmethod
    def _sin_codigo_repetido(codigo: str, en_seccion: List[Tuple[int, str, str]]) -> None:
        clave = normalizar_codigo(codigo)
        if any(normalizar_codigo(otro) == clave for _, otro, _ in en_seccion):
            raise CodigoEstudianteRepetido()

    @staticmethod
    def _aviso_mismo_nombre(nombre: str, en_seccion: List[Tuple[int, str, str]]) -> List[str]:
        """Mismo nombre con otro código: no es un repetido (pueden ser homónimos), solo se avisa."""
        clave = clave_nombre(nombre)
        codigo = next((c for _, c, n in en_seccion if clave_nombre(n) == clave), None)
        if codigo is None:
            return []
        return [f"Ya hay otro estudiante llamado '{nombre}' en la sección, con el código '{codigo}'"]

    def exportar(
        self, docente_email: str, curso_id: Optional[int] = None, seccion_id: Optional[int] = None,
    ) -> Tuple[bytes, str]:
        """
        (libro .xlsx, nombre de archivo). Sin filtros, los estudiantes de todas las
        asignaturas del docente en secciones activas; con curso_id y/o seccion_id, solo
        esos. Una sección pedida explícitamente se exporta aunque esté archivada.
        """
        curso = None
        if curso_id is not None:
            curso = self.cursos.get(curso_id)
            if not curso:
                raise AsignaturaNoEncontrada()
            if curso.docente_email != docente_email:
                raise SinPermiso("No tiene permiso sobre esta asignatura")
        seccion = None
        if seccion_id is not None:
            seccion = self._seccion_del_docente(seccion_id, docente_email)
            if curso is not None and seccion.curso_id != curso.id:
                raise SeccionFueraDeAsignatura()

        if seccion is not None:
            resultados = self.estudiantes.para_exportar(docente_email, seccion_id=seccion.id, solo_activas=False)
        else:
            resultados = self.estudiantes.para_exportar(
                docente_email, curso_id=curso.id if curso is not None else None
            )
        filas = [
            FilaEstudiante(
                nombre_completo=est.nombre_completo,
                codigo=est.codigo_estudiante,
                email=est.email,
                grupo=sec.nombre,
                asignatura=f"{cur.nombre} ({cur.codigo} · {cur.periodo})",
            )
            for est, sec, cur in resultados
        ]

        # El archivo lleva el código de la asignatura y la sección solo si se filtró por ellas
        curso_archivo = curso or (self.cursos.get(seccion.curso_id) if seccion else None)
        nombre = nombre_archivo_estudiantes(
            [*([curso_archivo.codigo] if curso_archivo else []), *([seccion.nombre] if seccion else [])]
        )
        return libro_estudiantes(filas), nombre

    def _seccion_del_docente(self, seccion_id: int, email: str) -> Seccion:
        seccion = self.secciones.get(seccion_id)
        if not seccion:
            raise SeccionNoEncontrada()
        curso = self.cursos.get(seccion.curso_id)
        if not curso or curso.docente_email != email:
            raise SinPermiso("No tiene permiso sobre esta sección")
        return seccion

    def _estudiante_del_docente(self, estudiante_id: int, email: str, accion: str) -> Estudiante:
        """`accion` ("editar" o "eliminar") solo cambia el texto del 403."""
        estudiante = self.estudiantes.get(estudiante_id)
        if not estudiante:
            raise EstudianteNoEncontrado()
        seccion = self.secciones.get(estudiante.seccion_id)
        curso: Optional[Curso] = self.cursos.get(seccion.curso_id)
        if not curso or curso.docente_email != email:
            raise SinPermiso(f"No tiene permiso para {accion} este estudiante")
        return estudiante
