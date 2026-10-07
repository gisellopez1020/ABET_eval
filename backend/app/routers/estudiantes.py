from typing import List, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Response, UploadFile, File, status
from sqlalchemy.orm import Session

from app.archivos import leer_archivo_limitado
from app.database import get_db
from app.auth.dependencies import get_current_user
from app.schemas import EstudianteCreate, EstudianteListadoOut, EstudianteOut, ImportacionCSVResultado
from app.schemas.estudiante import EstudianteCreado, EstudianteUpdate, VistaPreviaEstudiantes
from app.services.estudiantes import EstudianteConAviso, EstudianteService
from app.services.lista_estudiantes import MIME_XLSX

# Los errores de negocio (404, 403, 422) los lanza EstudianteService y los traduce
# a HTTP el manejador global registrado en main.py (app/errores_http.py)
router = APIRouter(tags=["Estudiantes"])


def _creado(resultado: EstudianteConAviso) -> EstudianteCreado:
    return EstudianteCreado(
        **EstudianteOut.model_validate(resultado.estudiante).model_dump(), aviso=resultado.aviso
    )


@router.get(
    "/secciones/{seccion_id}/estudiantes",
    response_model=List[EstudianteListadoOut],
    summary="Listar estudiantes de una sección",
)
def listar_estudiantes(
    seccion_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Devuelve todos los estudiantes matriculados en la sección, con su promedio
    ponderado sobre las actividades calificadas del curso (ver services/notas.py).
    404 si la sección no existe, 403 si es de otro docente.
    """
    return EstudianteService(db).listar(seccion_id, usuario["email"])


@router.post(
    "/secciones/{seccion_id}/estudiantes",
    response_model=EstudianteCreado,
    status_code=status.HTTP_201_CREATED,
    summary="Agregar estudiante manualmente",
)
def agregar_estudiante(
    seccion_id: int,
    body: EstudianteCreate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Agrega un único estudiante a la sección. El correo es opcional; si no tiene
    formato de correo el estudiante se crea igual, con el correo en blanco y un `aviso`.
    404 si la sección no existe, 403 si es de otro docente.
    """
    return _creado(EstudianteService(db).agregar(
        seccion_id, usuario["email"], body.nombre_completo, body.codigo_estudiante, body.email,
    ))


@router.post(
    "/secciones/{seccion_id}/estudiantes/csv",
    response_model=ImportacionCSVResultado,
    status_code=status.HTTP_201_CREATED,
    summary="Importar estudiantes desde CSV o Excel",
)
async def importar_csv(
    seccion_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Importa estudiantes desde un archivo CSV con formato:
    Nombre,Codigo[,Email]
    OSCAR EVELIO PRADA CEBALLOS,2021001

    La columna Email (o Correo) es opcional; sin ella el correo queda en blanco.
    También acepta el formato de la lista institucional (el mismo que exporta la app):
    Nombre | Apellido(s) | Número de ID | Dirección de correo | Grupo. Nombre y
    Apellido(s) se unen en el nombre completo; Grupo no se guarda (la sección es la
    de la URL) y solo genera un aviso si no coincide con ella.
    También acepta un .xlsx con las mismas dos columnas en la primera hoja
    (se detecta por la extensión o el content_type).
    404 si la sección no existe, 403 si es de otro docente, 422 si el archivo no
    se puede leer o le faltan las columnas obligatorias.
    """
    resultado = EstudianteService(db).importar(
        seccion_id, usuario["email"], await leer_archivo_limitado(archivo), archivo.filename, archivo.content_type,
    )
    return ImportacionCSVResultado(importados=resultado.importados, errores=resultado.avisos)


@router.post(
    "/secciones/{seccion_id}/estudiantes/vista-previa",
    response_model=VistaPreviaEstudiantes,
    summary="Leer estudiantes de un CSV o Excel sin importarlos",
)
async def vista_previa_estudiantes(
    seccion_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Devuelve los estudiantes que importaría POST .../estudiantes/csv con el mismo
    archivo, sin guardarlos. El frontend la usa para la vista previa de un .xlsx
    (la de un CSV se sigue calculando en el navegador). Mismos errores que la importación.
    """
    return EstudianteService(db).vista_previa(
        seccion_id, usuario["email"], await leer_archivo_limitado(archivo), archivo.filename, archivo.content_type,
    )


@router.get(
    "/estudiantes/exportar-excel",
    response_class=Response,
    summary="Exportar la lista de estudiantes a Excel",
)
def exportar_excel(
    curso_id: Optional[int] = Query(default=None),
    seccion_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    .xlsx con Nombre | Apellido(s) | Número de ID | Dirección de correo | Grupo, y una
    columna Asignatura si las filas vienen de más de una. Sin filtros exporta a los
    estudiantes de todas las asignaturas del docente (secciones activas, como la
    pantalla Estudiantes); con curso_id y/o seccion_id, solo esos. Una sección pedida
    explícitamente se exporta aunque esté archivada.
    El correo sale del campo email: en blanco si no se importó, nunca calculado.
    404 si la asignatura o la sección no existen (o la sección no es de esa asignatura),
    403 si son de otro docente.
    """
    contenido, nombre = EstudianteService(db).exportar(usuario["email"], curso_id, seccion_id)
    ascii_ = nombre.encode("ascii", "ignore").decode() or "Estudiantes.xlsx"
    return Response(
        content=contenido,
        media_type=MIME_XLSX,
        headers={"Content-Disposition": f"attachment; filename=\"{ascii_}\"; filename*=UTF-8''{quote(nombre)}"},
    )


@router.put(
    "/estudiantes/{estudiante_id}",
    response_model=EstudianteCreado,
    summary="Editar estudiante",
)
def editar_estudiante(
    estudiante_id: int,
    body: EstudianteUpdate,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Edita nombre, código y/o correo; solo cambia los campos enviados. No toca la
    sección, los equipos ni las calificaciones del estudiante.
    El correo se normaliza como en el alta (`null` o vacío lo borra). Uno sin formato
    de correo no bloquea la edición: se conserva el que había (en blanco si no había)
    y la respuesta trae un `aviso`.
    404 si el estudiante no existe, 403 si es de otro docente.
    """
    cambios = body.model_dump(include=body.model_fields_set)
    return _creado(EstudianteService(db).editar(estudiante_id, usuario["email"], cambios))


@router.delete(
    "/estudiantes/{estudiante_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar estudiante",
)
def eliminar_estudiante(
    estudiante_id: int,
    db: Session = Depends(get_db),
    usuario: dict = Depends(get_current_user),
):
    """
    Elimina un estudiante. También elimina sus calificaciones individuales.
    404 si el estudiante no existe, 403 si es de otro docente.
    """
    EstudianteService(db).eliminar(estudiante_id, usuario["email"])
