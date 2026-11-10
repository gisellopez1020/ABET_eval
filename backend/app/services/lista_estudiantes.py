"""
Lectura de listas de estudiantes desde CSV o Excel, sin base de datos ni HTTP.

Acepta dos formatos: el simple (Nombre, Codigo[, Email]) y el de la lista institucional
(Nombre | Apellido(s) | Número de ID | Dirección de correo | Grupo, el mismo que exporta
la app). Un archivo sin las columnas obligatorias, o un Excel ilegible, lanza
ArchivoInvalido; los problemas de una fila no frenan la lectura y quedan como avisos.

La regla del correo (normalizar_email) es la misma para la importación y para el alta
o edición manual: un correo que no lo parece se deja en blanco, nunca rechaza al estudiante.

Repetidos (separar_repetidos): un estudiante es el mismo si tiene el mismo código
normalizado (normalizar_codigo) en la misma sección. Los datos están cifrados con un
vector aleatorio, así que la comparación se hace aquí, en Python, contra los códigos ya
descifrados de la sección. Nombres y códigos de los omitidos solo van en la respuesta
al docente: nunca en logs ni en mensajes de excepción.
"""
import csv
import io
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, NamedTuple, Optional, Tuple

from app.services.errores import ArchivoInvalido
from app.utils.excel_lectura import ExcelIlegible, leer_primera_hoja

MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

# (número de fila en el archivo, nombre completo crudo, código crudo, correo crudo, grupo crudo).
# El nombre ya llega combinado con los apellidos si el archivo los trae en otra columna
FilaCruda = Tuple[int, Optional[str], Optional[str], Optional[str], Optional[str]]
# (nombre, código, correo o None)
EstudianteValido = Tuple[str, str, Optional[str]]

# Chequeo mínimo: algo@algo.algo sin espacios. No se corrige ni se completa el dato
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalizar_email(crudo: Optional[str]) -> Tuple[Optional[str], bool]:
    """
    (correo, era_invalido): recortado y en minúsculas, vacío -> None, y uno que no lo
    parece se deja en blanco (nunca se rechaza al estudiante por el formato ni se corrige el dato).
    """
    email = (crudo or "").strip().lower() or None
    if email and not _EMAIL_RE.match(email):
        return None, True
    return email, False


def normalizar_codigo(codigo: str) -> str:
    """
    Código comparable, solo para detectar repetidos (se guarda el código tal como vino):
    sin espacios (tampoco internos), en mayúsculas y, si es solo de dígitos, sin ceros a
    la izquierda. Excel guarda "00123" escrito como número como 123, y la misma lista en
    CSV y en Excel debe verse igual.
    """
    clave = "".join(codigo.split()).upper()
    if clave.isascii() and clave.isdigit():
        return clave.lstrip("0") or "0"
    return clave


def clave_nombre(nombre: str) -> str:
    """Nombre comparable: sin tildes, en minúsculas y sin espacios de más."""
    return _clave(nombre)


def es_excel(nombre_archivo: Optional[str], content_type: Optional[str]) -> bool:
    return (nombre_archivo or "").lower().endswith(".xlsx") or content_type == MIME_XLSX


def leer_lista(
    contenido: bytes,
    nombre_archivo: Optional[str],
    content_type: Optional[str],
    seccion_nombre: Optional[str] = None,
) -> Tuple[List[EstudianteValido], List[str]]:
    """
    Estudiantes válidos (nombre, código, correo) y avisos del archivo. El Excel se
    detecta por la extensión o el content_type; si no, se lee como CSV. No descarta
    repetidos: eso lo hace separar_repetidos sobre leer_lista_con_filas.
    """
    validos, avisos = leer_lista_con_filas(contenido, nombre_archivo, content_type, seccion_nombre)
    return [estudiante for _, estudiante in validos], avisos


def leer_lista_con_filas(
    contenido: bytes,
    nombre_archivo: Optional[str],
    content_type: Optional[str],
    seccion_nombre: Optional[str] = None,
) -> Tuple[List[Tuple[int, EstudianteValido]], List[str]]:
    """Como leer_lista, pero cada estudiante válido viene con su número de fila en el archivo."""
    if es_excel(nombre_archivo, content_type):
        filas = _leer_filas_excel(contenido)
    else:
        filas = _leer_filas_csv(contenido)
    return _procesar_filas(filas, seccion_nombre)


# ── Repetidos ────────────────────────────────────────────────────────────────

MotivoOmitido = Literal["en_seccion", "en_archivo"]

# Cuántos códigos (o filas) se nombran en el aviso agrupado antes de "y N más"
_MAX_EN_AVISO = 10


@dataclass(frozen=True)
class Omitido:
    """
    Fila del archivo que no se importa porque su código ya está en la sección
    (motivo "en_seccion") o en una fila anterior del archivo ("en_archivo").
    `nombre` y `codigo` son los de la fila descartada; `nombre_conservado` es el del
    estudiante que se queda (el guardado, o el de `fila_conservada` del archivo).
    """
    fila: int
    nombre: str
    codigo: str
    motivo: MotivoOmitido
    nombre_conservado: str
    fila_conservada: Optional[int] = None


@dataclass(frozen=True)
class EnSeccion:
    """Lo que hace falta de un estudiante guardado para comparar: código y nombre ya descifrados."""
    codigo: str
    nombre: str


def separar_repetidos(
    validos: List[Tuple[int, EstudianteValido]], en_seccion: List[EnSeccion],
) -> Tuple[List[EstudianteValido], List[Omitido], List[str]]:
    """
    (a importar, omitidos, avisos). Una fila se omite si su código normalizado ya está
    en la sección o en una fila anterior del archivo (gana la primera). Un nombre que ya
    está con otro código no es un repetido: se importa y solo se avisa.
    """
    guardados: Dict[str, EnSeccion] = {}
    nombres_guardados: Dict[str, str] = {}
    for est in en_seccion:
        guardados.setdefault(normalizar_codigo(est.codigo), est)
        nombres_guardados.setdefault(clave_nombre(est.nombre), est.codigo)

    a_importar: List[EstudianteValido] = []
    omitidos: List[Omitido] = []
    del_archivo: Dict[str, Tuple[int, str]] = {}  # código normalizado -> (fila, nombre) que se queda
    nombres_archivo: Dict[str, Tuple[int, str]] = {}  # nombre comparable -> (fila, código)
    mismo_nombre: List[str] = []

    for fila, (nombre, codigo, email) in validos:
        clave = normalizar_codigo(codigo)
        if clave in guardados:
            omitidos.append(Omitido(fila, nombre, codigo, "en_seccion", guardados[clave].nombre))
            continue
        if clave in del_archivo:
            fila_previa, nombre_previo = del_archivo[clave]
            omitidos.append(Omitido(fila, nombre, codigo, "en_archivo", nombre_previo, fila_previa))
            continue
        del_archivo[clave] = (fila, nombre)
        a_importar.append((nombre, codigo, email))

        clave_n = clave_nombre(nombre)
        if clave_n in nombres_guardados:
            mismo_nombre.append(
                f"Fila {fila}: '{nombre}' ya está en la sección con el código "
                f"'{nombres_guardados[clave_n]}'; se importa igual con el código '{codigo}'"
            )
        elif clave_n in nombres_archivo:
            fila_previa, codigo_previo = nombres_archivo[clave_n]
            mismo_nombre.append(
                f"Fila {fila}: '{nombre}' también está en la fila {fila_previa} con otro código "
                f"('{codigo_previo}'); se importan los dos"
            )
        else:
            nombres_archivo[clave_n] = (fila, codigo)

    return a_importar, omitidos, _avisos_omitidos(omitidos) + mismo_nombre


def _lista_corta(valores: List[str]) -> str:
    texto = ", ".join(valores[:_MAX_EN_AVISO])
    resto = len(valores) - _MAX_EN_AVISO
    return f"{texto} y {resto} más" if resto > 0 else texto


def _avisos_omitidos(omitidos: List[Omitido]) -> List[str]:
    """Un aviso por motivo (no uno por fila), con los primeros códigos o filas."""
    avisos: List[str] = []
    en_seccion = [o.codigo for o in omitidos if o.motivo == "en_seccion"]
    if en_seccion:
        n = len(en_seccion)
        avisos.append(
            f"Se omite{'n' if n != 1 else ''} {n} estudiante{'s' if n != 1 else ''} cuyo código ya "
            f"está en la sección: {_lista_corta(en_seccion)}"
        )
    en_archivo = [str(o.fila) for o in omitidos if o.motivo == "en_archivo"]
    if en_archivo:
        n = len(en_archivo)
        avisos.append(
            f"Se omite{'n' if n != 1 else ''} {n} fila{'s' if n != 1 else ''} con un código repetido "
            f"en el archivo (se conserva la primera): fila{'s' if n != 1 else ''} {_lista_corta(en_archivo)}"
        )
    return avisos


class Columnas(NamedTuple):
    nombre: Optional[str]
    codigo: Optional[str]
    email: Optional[str] = None
    apellidos: Optional[str] = None
    grupo: Optional[str] = None


def _clave(encabezado: str) -> str:
    """Encabezado comparable: minúsculas, sin tildes y sin espacios de más."""
    sin_tildes = unicodedata.normalize("NFKD", encabezado).encode("ascii", "ignore").decode()
    return " ".join(sin_tildes.lower().split())


# Formato de la lista institucional: Nombre | Apellido(s) | Número de ID | Dirección de correo | Grupo.
# Se compara el encabezado entero: buscar "id" como fragmento también encontraría "Apellido(s)"
_ALIAS_CODIGO = {"numero de id", "id"}


def _columnas(campos: List[str]) -> Columnas:
    col_nombre = next((c for c in campos if "nombre" in c.lower()), None)
    col_codigo = next((c for c in campos if "codigo" in c.lower() or "código" in c.lower()), None)
    if col_codigo is None:
        col_codigo = next((c for c in campos if _clave(c) in _ALIAS_CODIGO), None)
    # Opcional: sin esta columna el correo queda NULL ("Dirección de correo" entra por "correo")
    col_email = next(
        (c for c in campos if any(k in c.lower() for k in ("email", "e-mail", "correo"))), None
    )
    # Opcionales: apellidos en columna aparte (se unen al nombre) y grupo (solo para avisar)
    col_apellidos = next((c for c in campos if _clave(c).startswith("apellido")), None)
    col_grupo = next((c for c in campos if _clave(c) == "grupo"), None)
    return Columnas(col_nombre, col_codigo, col_email, col_apellidos, col_grupo)


def _nombre_completo(nombre: Optional[str], apellidos: Optional[str]) -> str:
    """Une Nombre y Apellido(s) cuando vienen separados; sin apellidos, el nombre ya es el completo."""
    return f"{(nombre or '').strip()} {(apellidos or '').strip()}".strip()


def _leer_filas_csv(contenido: bytes) -> List[FilaCruda]:
    try:
        texto = contenido.decode("utf-8-sig")  # utf-8-sig maneja BOM de Excel
    except UnicodeDecodeError:
        texto = contenido.decode("latin-1")

    lector = csv.DictReader(io.StringIO(texto))
    cols = _columnas(lector.fieldnames or [])

    if not cols.nombre or not cols.codigo:
        raise ArchivoInvalido("El CSV debe tener columnas 'Nombre' y 'Codigo' (o 'Código', o 'Número de ID')")

    return [
        (
            i,
            _nombre_completo(fila.get(cols.nombre), fila.get(cols.apellidos) if cols.apellidos else None),
            fila.get(cols.codigo),
            fila.get(cols.email) if cols.email else None,
            fila.get(cols.grupo) if cols.grupo else None,
        )
        for i, fila in enumerate(lector, start=2)
    ]


def _texto(v: Any) -> str:
    """Toda celda como texto, igual que en el CSV: vacía -> "" y 2021001 -> "2021001" (sin ".0")."""
    return "" if v is None else str(v)


def _leer_filas_excel(contenido: bytes) -> List[FilaCruda]:
    try:
        filas = leer_primera_hoja(contenido)
    except ExcelIlegible as exc:
        raise ArchivoInvalido(f"No se pudo leer el archivo Excel: {exc}")

    encabezados = [_texto(c) for c in filas[0]] if filas else []
    cols = _columnas(encabezados)

    if not cols.nombre or not cols.codigo:
        raise ArchivoInvalido("El Excel debe tener columnas 'Nombre' y 'Codigo' (o 'Código', o 'Número de ID')")

    # Por posición: con encabezados repetidos vale la primera columna, como en _columnas
    def valor(fila: list, nombre_col: Optional[str]) -> Optional[str]:
        return _texto(fila[encabezados.index(nombre_col)]) if nombre_col else None

    return [
        (
            i,
            _nombre_completo(valor(fila, cols.nombre), valor(fila, cols.apellidos)),
            valor(fila, cols.codigo),
            valor(fila, cols.email),
            valor(fila, cols.grupo),
        )
        for i, fila in enumerate(filas[1:], start=2)
    ]


def _procesar_filas(
    filas: List[FilaCruda], seccion_nombre: Optional[str] = None
) -> Tuple[List[Tuple[int, EstudianteValido]], List[str]]:
    """
    Normaliza las filas y separa las válidas ((fila, (nombre, código, correo))) de los errores.
    Un correo que no lo parece no descarta la fila: el estudiante se importa con el
    correo en blanco y queda un aviso.
    La columna Grupo no se guarda (la sección la define la URL): si se pasa
    seccion_nombre, solo se avisa cuando no coincide, una vez por valor distinto.
    """
    validos: List[Tuple[int, EstudianteValido]] = []
    errores: List[str] = []
    otros_grupos: Counter = Counter()

    for i, nombre_crudo, codigo_crudo, email_crudo, grupo_crudo in filas:
        nombre = (nombre_crudo or "").strip().upper()
        codigo = (codigo_crudo or "").strip()
        if not nombre or not codigo:
            errores.append(f"Fila {i}: nombre o código vacío, se omite")
            continue
        email, email_invalido = normalizar_email(email_crudo)
        if email_invalido:
            errores.append(f"Fila {i}: correo '{email_crudo.strip()}' no válido, se deja en blanco")
        validos.append((i, (nombre, codigo, email)))
        grupo = (grupo_crudo or "").strip()
        if seccion_nombre is not None and grupo and _clave(grupo) != _clave(seccion_nombre):
            otros_grupos[grupo] += 1

    for grupo, n in otros_grupos.items():
        errores.append(
            f"{n} fila{'s tienen' if n != 1 else ' tiene'} Grupo '{grupo}', distinto de esta "
            f"sección ('{seccion_nombre}'); se importa{'n' if n != 1 else ''} igual"
        )

    return validos, errores
