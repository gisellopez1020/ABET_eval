"""
Script de datos de ejemplo para desarrollo local.

Carga el curso 545210 (Redes De Datos, 2026-1) con datos reales anonimizados
desde scripts/seed_545210.json: la actividad grupal con sus aspectos y criterios,
6 equipos repartidos en 2 secciones y las calificaciones completas de cada equipo.

Uso:
    cd backend
    python scripts/seed.py

Idempotente: si el curso 545210 ya existe, no duplica datos.
"""

import sys
import os
import json
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models import (
    Curso, Seccion, Estudiante, Actividad, TipoActividad,
    Aspecto, Criterio, EquipoTrabajo, MiembroEquipo, Calificacion, RaAbetCatalogo,
)
from app.utils.calculo import calcular_nota_parcial

RUTA_DATOS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_545210.json")

# Reparto de equipos por sección (3 y 3)
SECCIONES = {
    "Grupo 1": ["Equipo 1", "Equipo 2", "Equipo 3"],
    "Grupo 51": ["Equipo 4", "Equipo 5", "Equipo 6"],
}

# Prefijo de los códigos de estudiante ficticios: 2026100001, 2026100002, ...
PREFIJO_CODIGO = 2026100000


def cargar_datos():
    with open(RUTA_DATOS, encoding="utf-8") as f:
        datos = json.load(f)

    total_criterios = sum(len(a["criterios"]) for a in datos["aspectos"])
    for aspecto in datos["aspectos"]:
        suma = sum(Decimal(str(c["peso_porcentaje"])) for c in aspecto["criterios"])
        if suma != Decimal("100"):
            raise ValueError(f"Los pesos del aspecto '{aspecto['nombre']}' suman {suma}, no 100")
    for equipo in datos["equipos"]:
        if len(equipo["cumple"]) != total_criterios:
            raise ValueError(
                f"{equipo['nombre']} tiene {len(equipo['cumple'])} valores en 'cumple', "
                f"se esperaban {total_criterios}"
            )
    nombres_equipos = {e["nombre"] for e in datos["equipos"]}
    repartidos = {n for equipos in SECCIONES.values() for n in equipos}
    if nombres_equipos != repartidos:
        raise ValueError(f"Equipos del JSON {sorted(nombres_equipos)} no coinciden con SECCIONES")
    return datos


def seed():
    datos = cargar_datos()
    datos_curso = datos["curso"]
    datos_actividad = datos["actividad"]

    db = SessionLocal()
    try:
        # Idempotencia: si el curso ya existe, salir
        existente = db.query(Curso).filter_by(
            codigo=datos_curso["codigo"], periodo=datos_curso["periodo"]
        ).first()
        if existente:
            print("Los datos de ejemplo ya están cargados. No se hará nada.")
            return

        # Los códigos ABET de los aspectos deben existir en el catálogo (FK)
        codigos_abet = [a["codigo_abet"] for a in datos["aspectos"] if a["codigo_abet"]]
        padres = dict(
            db.query(RaAbetCatalogo.codigo, RaAbetCatalogo.codigo_padre)
            .filter(RaAbetCatalogo.codigo.in_(codigos_abet))
            .all()
        )
        faltantes = [c for c in codigos_abet if c not in padres]
        if faltantes:
            print(
                "ERROR: faltan en el catálogo ABET los códigos "
                f"{', '.join(faltantes)}. Regístralos antes de ejecutar el seed."
            )
            return

        # ── Curso ────────────────────────────────────────────────────────────
        curso = Curso(
            nombre=datos_curso["nombre"],
            codigo=datos_curso["codigo"],
            periodo=datos_curso["periodo"],
            docente_email="profesor.test@uao.edu.co",
            # RA padre de los códigos vinculados, como hace la app al vincular un aspecto
            ra_abet=list(dict.fromkeys(padres[c] for c in codigos_abet)),
            activo=True,
        )
        db.add(curso)
        db.flush()

        # ── Secciones ────────────────────────────────────────────────────────
        secciones = {}
        for nombre_seccion in SECCIONES:
            seccion = Seccion(nombre=nombre_seccion, curso_id=curso.id, activo=True)
            db.add(seccion)
            secciones[nombre_seccion] = seccion
        db.flush()
        seccion_de_equipo = {
            nombre_equipo: secciones[nombre_seccion]
            for nombre_seccion, equipos in SECCIONES.items()
            for nombre_equipo in equipos
        }

        # ── Estudiantes (en la sección de su equipo) ─────────────────────────
        estudiantes_por_equipo = {}
        consecutivo = 0
        for datos_equipo in datos["equipos"]:
            seccion = seccion_de_equipo[datos_equipo["nombre"]]
            estudiantes = []
            for nombre in datos_equipo["estudiantes"]:
                consecutivo += 1
                estudiantes.append(Estudiante(
                    nombre_completo=nombre,
                    codigo_estudiante=str(PREFIJO_CODIGO + consecutivo),
                    seccion_id=seccion.id,
                ))
            db.add_all(estudiantes)
            estudiantes_por_equipo[datos_equipo["nombre"]] = estudiantes
        db.flush()

        # ── Actividad ────────────────────────────────────────────────────────
        actividad = Actividad(
            nombre=datos_actividad["nombre"],
            tipo=TipoActividad(datos_actividad["tipo"]),
            peso_nota_final=Decimal(str(datos_actividad["peso_nota_final"])),
            curso_id=curso.id,
        )
        db.add(actividad)
        db.flush()

        # ── Aspectos y criterios ─────────────────────────────────────────────
        todos_criterios = []
        for orden_aspecto, datos_aspecto in enumerate(datos["aspectos"], start=1):
            aspecto = Aspecto(
                nombre=datos_aspecto["nombre"],
                actividad_id=actividad.id,
                orden=orden_aspecto,
                codigo_abet=datos_aspecto["codigo_abet"],
            )
            db.add(aspecto)
            db.flush()
            for orden_criterio, datos_criterio in enumerate(datos_aspecto["criterios"], start=1):
                criterio = Criterio(
                    texto=datos_criterio["texto"],
                    peso_porcentaje=Decimal(str(datos_criterio["peso_porcentaje"])),
                    aspecto_id=aspecto.id,
                    orden=orden_criterio,
                )
                db.add(criterio)
                todos_criterios.append(criterio)
        db.flush()

        # ── Equipos de trabajo y miembros ────────────────────────────────────
        equipos = []
        for datos_equipo in datos["equipos"]:
            equipo = EquipoTrabajo(
                nombre=datos_equipo["nombre"],
                actividad_id=actividad.id,
                seccion_id=seccion_de_equipo[datos_equipo["nombre"]].id,
            )
            db.add(equipo)
            equipos.append((equipo, datos_equipo))
        db.flush()

        for equipo, datos_equipo in equipos:
            db.add_all([
                MiembroEquipo(equipo_id=equipo.id, estudiante_id=estudiante.id)
                for estudiante in estudiantes_por_equipo[datos_equipo["nombre"]]
            ])
        db.flush()

        # ── Calificaciones (todos los criterios de los 6 equipos) ────────────
        for equipo, datos_equipo in equipos:
            for criterio, valor in zip(todos_criterios, datos_equipo["cumple"]):
                nota_parcial = calcular_nota_parcial(valor, criterio.peso_porcentaje)
                db.add(Calificacion(
                    criterio_id=criterio.id,
                    valor=valor,
                    equipo_id=equipo.id,
                    nota_calculada=nota_parcial,
                ))

        db.commit()

        print("✓ Datos de ejemplo cargados correctamente:")
        print(f"  Curso  : {curso.nombre} ({curso.codigo}) — {curso.periodo}")
        for nombre_seccion, nombres_equipos in SECCIONES.items():
            n = sum(len(estudiantes_por_equipo[e]) for e in nombres_equipos)
            print(f"  Sección: {nombre_seccion} ({n} estudiantes, {', '.join(nombres_equipos)})")
        print(f"  Actividad: {actividad.nombre} — tipo grupal, peso {actividad.peso_nota_final}%")
        print(f"  Aspectos : {len(datos['aspectos'])} ({len(codigos_abet)} con código ABET)")
        print(f"  Criterios: {len(todos_criterios)} criterios (cada aspecto suma 100%)")
        for equipo, datos_equipo in equipos:
            cumplidos = sum(datos_equipo["cumple"])
            print(f"  {equipo.nombre}: calificado ({cumplidos}/{len(todos_criterios)} criterios cumplidos)")

    except Exception as exc:
        db.rollback()
        print(f"ERROR al cargar datos de ejemplo: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
