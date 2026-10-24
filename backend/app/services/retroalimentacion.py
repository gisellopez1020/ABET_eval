"""
Retroalimentación de un equipo o estudiante en una actividad, a partir de su rúbrica y
de la calificación guardada. Dos capas:

1. Estructurada (sin IA): por aspecto, el texto de los criterios cumplidos y no cumplidos.
   Se arma de la BD en cada lectura y siempre está disponible.
2. Redactada con IA (Gemini) encima de la 1: un párrafo que no agrega nada fuera de ella.
   Solo con la calificación completa. Se guarda con una `huella` de sus datos de entrada
   y se reusa mientras no cambien; si cambia una calificación, la rúbrica, el modelo o
   las instrucciones, la huella deja de coincidir y se vuelve a redactar. Si la IA no
   está configurada o falla, se responde la 1 y no se guarda nada.

A la API externa solo viajan los textos de la rúbrica y si se cumplieron: nunca nombres
de estudiantes ni del equipo.
"""
import hashlib
import json
from typing import Dict, List, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Calificacion, Retroalimentacion
from app.repositories.actividad import ActividadRepository
from app.repositories.retroalimentacion import RetroalimentacionRepository
from app.schemas.retroalimentacion import AspectoRetroalimentacion, RetroalimentacionOut
from app.services import gemini
from app.services.calificaciones import CalificacionService

INSTRUCCIONES = """Eres un asistente que redacta retroalimentación académica para estudiantes universitarios
de ingeniería, a partir de una rúbrica ya calificada por su docente.

Reglas obligatorias:
- Usa ÚNICAMENTE la información de los criterios que se te entregan. No inventes logros,
  dificultades, ejemplos, causas ni recomendaciones que no se deriven directamente del
  texto de esos criterios.
- No menciones notas, porcentajes, pesos ni puntajes.
- No te dirijas a nadie por su nombre ni inventes nombres.
- Escribe en español, en segunda persona del plural si es un equipo ("lograron",
  "les falta") o del singular si es un estudiante ("lograste", "te falta").
- Tono constructivo y respetuoso: primero lo que se logró, luego lo que conviene reforzar,
  presentado como oportunidad de mejora, no como reproche.
- Si todos los criterios se cumplieron, reconócelo sin inventar aspectos por mejorar.
  Si ninguno se cumplió, enfócate en qué reforzar sin desanimar.
- Un solo párrafo de entre 3 y 6 oraciones, en texto plano, sin viñetas, sin títulos y
  sin formato Markdown."""


class RetroalimentacionService:
    def __init__(self, db: Session):
        self.db = db
        self.actividades = ActividadRepository(db)
        self.retroalimentaciones = RetroalimentacionRepository(db)

    def de_equipo(self, actividad_id: int, equipo_id: int, docente_email: str) -> RetroalimentacionOut:
        # Mismos permisos y errores (403/404) que leer sus calificaciones
        calificaciones = CalificacionService(self.db).de_equipo(actividad_id, equipo_id, docente_email)
        return self._retroalimentacion(actividad_id, calificaciones, equipo_id=equipo_id)

    def de_estudiante(self, actividad_id: int, estudiante_id: int, docente_email: str) -> RetroalimentacionOut:
        calificaciones = CalificacionService(self.db).de_estudiante(actividad_id, estudiante_id, docente_email)
        return self._retroalimentacion(actividad_id, calificaciones, estudiante_id=estudiante_id)

    def _retroalimentacion(
        self, actividad_id: int, calificaciones: List[Calificacion],
        equipo_id: Optional[int] = None, estudiante_id: Optional[int] = None,
    ) -> RetroalimentacionOut:
        valores: Dict[int, int] = {c.criterio_id: c.valor for c in calificaciones}
        actividad = self.actividades.get(actividad_id)
        aspectos: List[AspectoRetroalimentacion] = []
        completa = True
        hay_criterios = False
        for aspecto in actividad.aspectos:
            if not aspecto.criterios:
                continue
            hay_criterios = True
            cumplidos, por_reforzar = [], []
            for criterio in aspecto.criterios:
                valor = valores.get(criterio.id)
                if valor is None:
                    completa = False
                elif valor == 1:
                    cumplidos.append(criterio.texto)
                else:
                    por_reforzar.append(criterio.texto)
            aspectos.append(AspectoRetroalimentacion(
                aspecto_id=aspecto.id, nombre=aspecto.nombre,
                cumplidos=cumplidos, por_reforzar=por_reforzar,
            ))
        completa = completa and hay_criterios

        estructurada = RetroalimentacionOut(completa=completa, fuente="estructurada", aspectos=aspectos)
        if not completa:
            return estructurada

        tipo = "equipo" if equipo_id else "estudiante"
        huella = _huella(tipo, aspectos)
        guardada = self.retroalimentaciones.de(actividad_id, equipo_id, estudiante_id)
        if guardada and guardada.huella == huella:
            return _con_texto(estructurada, guardada)

        texto = gemini.redactar(INSTRUCCIONES, mensaje_para_ia(tipo, aspectos))
        if texto is None:
            return estructurada

        if guardada:
            guardada.texto, guardada.huella, guardada.modelo = texto, huella, settings.gemini_model
        else:
            guardada = self.retroalimentaciones.agregar(Retroalimentacion(
                actividad_id=actividad_id, equipo_id=equipo_id, estudiante_id=estudiante_id,
                texto=texto, huella=huella, modelo=settings.gemini_model,
            ))
        try:
            self.db.commit()
        except IntegrityError:
            # Otra petición la guardó primero (índice único): se responde la redactada
            # aquí sin guardarla; la próxima lectura reusa la que quedó
            self.db.rollback()
            return estructurada.model_copy(update={"fuente": "ia", "texto": texto})
        self.db.refresh(guardada)
        return _con_texto(estructurada, guardada)


def mensaje_para_ia(tipo: str, aspectos: List[AspectoRetroalimentacion]) -> str:
    """Lo único que viaja a la API: el tipo y los textos de la rúbrica con su resultado."""
    lineas = [f"Tipo: {tipo}", "", "Resultados por aspecto de la rúbrica (texto exacto de cada criterio):"]
    for aspecto in aspectos:
        lineas.append("")
        lineas.append(f'Aspecto: "{aspecto.nombre}"')
        lineas.extend(f'- Cumplido: "{t}"' for t in aspecto.cumplidos)
        lineas.extend(f'- No cumplido: "{t}"' for t in aspecto.por_reforzar)
    lineas.extend(["", "Redacta la retroalimentación siguiendo las reglas."])
    return "\n".join(lineas)


def _huella(tipo: str, aspectos: List[AspectoRetroalimentacion]) -> str:
    """SHA-256 de todo lo que determina el texto: datos, instrucciones y modelo."""
    datos = {
        "modelo": settings.gemini_model,
        "instrucciones": INSTRUCCIONES,
        "mensaje": mensaje_para_ia(tipo, aspectos),
    }
    return hashlib.sha256(json.dumps(datos, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def _con_texto(estructurada: RetroalimentacionOut, guardada: Retroalimentacion) -> RetroalimentacionOut:
    return estructurada.model_copy(update={
        "fuente": "ia", "texto": guardada.texto, "generada_en": guardada.updated_at,
    })
