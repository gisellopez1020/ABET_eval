"""
Lectura de listas de estudiantes desde CSV o Excel, sin base de datos ni HTTP.

Acepta dos formatos: el simple (Nombre, Codigo[, Email]) y el de la lista institucional
(Nombre | Apellido(s) | Número de ID | Dirección de correo | Grupo, el mismo que exporta
la app). Un archivo sin las columnas obligatorias, o un Excel ilegible, lanza
ArchivoInvalido; los problemas de una fila no frenan la lectura y quedan como avisos.

La regla del correo (normalizar_email) es la misma para la importación y para el alta
o edición manual: un correo que no lo parece se deja en blanco, nunca rechaza al estudiante.
"""
import csv
import io
import re
import unicodedata
from collections import Counter
from typing import List, NamedTuple, Optional, Tuple

from app.services.errores import ArchivoInvalido

try:
    import pandas as pd
except ImportError:  # misma dependencia opcional que utils/excel_parser.py
    pd = None

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
    detecta por la extensión o el content_type; si no, se lee como CSV.
    """
    if es_excel(nombre_archivo, content_type):
        filas = _leer_filas_excel(contenido)
    else:
        filas = _leer_filas_csv(contenido)
    return _procesar_filas(filas, seccion_nombre)


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


def _leer_filas_excel(contenido: bytes) -> List[FilaCruda]:
    if pd is None:
        raise ArchivoInvalido("pandas y openpyxl son necesarios para leer Excel")
    try:
        # dtype=str: un código como 2021001 no debe llegar como 2021001.0;
        # keep_default_na=False: las celdas vacías llegan como "" y no como NaN
        df = pd.read_excel(io.BytesIO(contenido), header=0, dtype=str, keep_default_na=False)
    except Exception as exc:
        raise ArchivoInvalido(f"No se pudo leer el archivo Excel: {exc}")

    df.columns = [str(c) for c in df.columns]
    cols = _columnas(list(df.columns))

    if not cols.nombre or not cols.codigo:
        raise ArchivoInvalido("El Excel debe tener columnas 'Nombre' y 'Codigo' (o 'Código', o 'Número de ID')")

    def columna(nombre_col: Optional[str]):
        return df[nombre_col] if nombre_col else [None] * len(df)

    return [
        (i, _nombre_completo(nombre, apellidos), codigo, email, grupo)
        for i, (nombre, apellidos, codigo, email, grupo) in enumerate(
            zip(df[cols.nombre], columna(cols.apellidos), df[cols.codigo], columna(cols.email), columna(cols.grupo)),
            start=2,
        )
    ]


def _procesar_filas(
    filas: List[FilaCruda], seccion_nombre: Optional[str] = None
) -> Tuple[List[EstudianteValido], List[str]]:
    """
    Normaliza las filas y separa las válidas (nombre, código, correo) de los errores.
    Un correo que no lo parece no descarta la fila: el estudiante se importa con el
    correo en blanco y queda un aviso.
    La columna Grupo no se guarda (la sección la define la URL): si se pasa
    seccion_nombre, solo se avisa cuando no coincide, una vez por valor distinto.
    """
    validos: List[EstudianteValido] = []
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
        validos.append((nombre, codigo, email))
        grupo = (grupo_crudo or "").strip()
        if seccion_nombre is not None and grupo and _clave(grupo) != _clave(seccion_nombre):
            otros_grupos[grupo] += 1

    for grupo, n in otros_grupos.items():
        errores.append(
            f"{n} fila{'s tienen' if n != 1 else ' tiene'} Grupo '{grupo}', distinto de esta "
            f"sección ('{seccion_nombre}'); se importa{'n' if n != 1 else ''} igual"
        )

    return validos, errores
