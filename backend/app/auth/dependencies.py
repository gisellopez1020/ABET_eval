import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Cookie, Header, HTTPException, Request, status

from app.config import ALGORITMO_JWT, settings

logger = logging.getLogger(__name__)

MOCK_USER = {
    "email": "profesor.test@uao.edu.co",
    "nombre": "Profesor Test UAO",
}

# El JWT de la app viaja en esta cookie httpOnly (el frontend no puede leerla).
SESSION_COOKIE_NAME = "session"

# Protección CSRF: el JWT lleva un token aleatorio en el claim "csrf"; el frontend
# lo obtiene de GET /auth/me y lo reenvía en este header en cada petición que
# modifica datos. Un sitio ajeno no puede leer /auth/me (CORS) ni forjar el JWT,
# así que no puede adivinar el valor aunque el navegador adjunte la cookie.
CSRF_HEADER = "X-CSRF-Token"
CSRF_CLAIM = "csrf"
METODOS_SEGUROS = frozenset({"GET", "HEAD", "OPTIONS"})


# RNF-16 (ventana deslizante con tope absoluto). El JWT lleva:
#   iat      cuándo se emitió esta versión del token (login o última renovación)
#   exp      iat + SESION_INACTIVIDAD_MINUTOS, sin pasar de ses_max
#   ses_max  tope absoluto: login + SESION_DURACION_MAXIMA_MINUTOS. Se fija en el login
#            y cada renovación lo copia tal cual: no se puede extender.
CLAIM_TOPE = "ses_max"
# Una petición autenticada re-emite la cookie solo si el token tiene al menos esta
# edad: /auth/me se consulta a menudo y no hace falta un Set-Cookie en cada respuesta.
# Por eso la sesión vence entre 7 h 45 min y 8 h después de la última petición.
RENOVAR_TRAS = timedelta(minutes=15)
# Dónde deja get_current_user el token renovado (request.state); lo escribe en la
# respuesta app.auth.renovacion.RenovarSesion
ESTADO_SESION_RENOVADA = "sesion_renovada"


def _ahora() -> datetime:
    """Único reloj de la sesión (las pruebas lo sustituyen para simular el paso del tiempo)."""
    return datetime.now(timezone.utc)


def _firmar(email: str, nombre: str, csrf: str, emitido: datetime, tope: datetime) -> str:
    expira = min(emitido + timedelta(minutes=settings.sesion_inactividad_minutos), tope)
    payload = {
        "email": email,
        "nombre": nombre,
        CSRF_CLAIM: csrf,
        "iat": int(emitido.timestamp()),
        "exp": int(expira.timestamp()),
        CLAIM_TOPE: int(tope.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=ALGORITMO_JWT)


def create_access_token(email: str, nombre: str) -> str:
    """Emite el JWT propio de la app (con su token CSRF) para un docente ya autenticado con Google.

    Vence a los SESION_INACTIVIDAD_MINUTOS (la cookie del callback dura lo mismo) y fija
    el tope absoluto de la sesión.
    """
    ahora = _ahora()
    tope = ahora + timedelta(minutes=settings.sesion_duracion_maxima_minutos)
    return _firmar(email, nombre, secrets.token_urlsafe(32), ahora, tope)


def _sesion_invalida(motivo: str) -> HTTPException:
    # El motivo exacto (firma, vencimiento, formato) solo va al log, no al cliente
    logger.info("Sesión rechazada: %s", motivo)
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sesión inválida o expirada; inicia sesión de nuevo",
    )


def _instante(payload: dict, claim: str) -> datetime:
    valor = payload.get(claim)
    # bool es int en Python: un true/false no es una fecha
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        raise _sesion_invalida(f"claim {claim} no numérico")
    return datetime.fromtimestamp(valor, tz=timezone.utc)


def decodificar_sesion(token: Optional[str]) -> dict:
    """Valida el JWT de la cookie de sesión y devuelve email, nombre y token CSRF.

    Incluye también, bajo "sesion", los instantes con que get_current_user decide si
    renovarla (iat, exp y ses_max).
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No hay una sesión iniciada; inicia sesión con Google",
        )
    try:
        # Algoritmo fijo (nunca el que diga el token) y exp, iat y ses_max obligatorios:
        # un JWT sin vencimiento o sin tope (p. ej. uno emitido antes de la 1.0.0) no se
        # acepta aunque esté bien firmado. Las fechas se comprueban abajo con _ahora(),
        # el mismo reloj con que se emiten.
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[ALGORITMO_JWT],
            options={
                "require": ["exp", "iat", CLAIM_TOPE],
                "verify_exp": False,
                "verify_iat": False,
            },
        )
    except jwt.PyJWTError as exc:
        raise _sesion_invalida(str(exc)) from exc

    emitido = _instante(payload, "iat")
    expira = _instante(payload, "exp")
    tope = _instante(payload, CLAIM_TOPE)
    ahora = _ahora()
    if ahora >= expira:
        raise _sesion_invalida("vencida por inactividad")
    if ahora >= tope or expira > tope:
        raise _sesion_invalida("pasó el tope absoluto de la sesión")

    email = payload.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión inválida: no contiene email del usuario",
        )
    return {
        "email": email,
        "nombre": payload.get("nombre", ""),
        "csrf_token": payload.get(CSRF_CLAIM),
        "sesion": {"iat": emitido, "exp": expira, CLAIM_TOPE: tope},
    }


def renovar_sesion(usuario: dict) -> Optional[tuple[str, int]]:
    """Token renovado y su duración en segundos, o None si no toca renovar.

    Toca si el token tiene al menos RENOVAR_TRAS y el nuevo vencimiento queda más
    lejos que el actual (cerca del tope ya no se puede extender). Conserva el claim
    CSRF y el tope: el token CSRF que el frontend tiene en memoria sigue valiendo.
    """
    sesion = usuario["sesion"]
    if not usuario.get("csrf_token"):
        # La app nunca emite tokens sin CSRF: no se prolonga uno así
        return None
    ahora = _ahora()
    if ahora - sesion["iat"] < RENOVAR_TRAS:
        return None
    tope = sesion[CLAIM_TOPE]
    nuevo_exp = min(ahora + timedelta(minutes=settings.sesion_inactividad_minutos), tope)
    if nuevo_exp <= sesion["exp"]:
        return None
    token = _firmar(usuario["email"], usuario["nombre"], usuario["csrf_token"], ahora, tope)
    return token, int((nuevo_exp - ahora).total_seconds())


def verificar_csrf(request: Request, usuario: dict, csrf_header: Optional[str]) -> None:
    """En métodos que modifican datos, exige que el header CSRF coincida con el de la sesión."""
    if request.method in METODOS_SEGUROS:
        return
    esperado = usuario.get("csrf_token")
    if not (
        csrf_header
        and esperado
        and secrets.compare_digest(csrf_header.encode(), esperado.encode())
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Falta el header {CSRF_HEADER} o no coincide con la sesión",
        )


def get_current_user(
    request: Request,
    session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    csrf_header: Optional[str] = Header(default=None, alias=CSRF_HEADER),
) -> dict:
    """
    Devuelve el usuario autenticado a partir del JWT de la cookie de sesión.
    En POST/PUT/PATCH/DELETE exige además el header CSRF.
    En modo SKIP_AUTH=true retorna un usuario mock sin cookie ni CSRF.
    """
    if settings.skip_auth:
        return MOCK_USER

    usuario = decodificar_sesion(session)
    verificar_csrf(request, usuario, csrf_header)
    # Actividad: si toca, la respuesta lleva la cookie renovada (RNF-16)
    renovada = renovar_sesion(usuario)
    if renovada:
        setattr(request.state, ESTADO_SESION_RENOVADA, renovada)
    return usuario
