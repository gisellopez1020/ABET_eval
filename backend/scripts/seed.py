"""
Script de datos de ejemplo para desarrollo local.

Uso:
    cd backend
    python scripts/seed.py

Idempotente: si el curso IS-402 ya existe, no duplica datos.
"""

import sys
import os
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models import (
    Curso, Seccion, Estudiante, Actividad, TipoActividad,
    Aspecto, Criterio, EquipoTrabajo, MiembroEquipo, Calificacion,
)
from app.utils.calculo import calcular_nota_parcial


def seed():
    db = SessionLocal()
    try:
        # Idempotencia: si el curso ya existe, salir
        existente = db.query(Curso).filter_by(codigo="IS-402", periodo="2025-3B").first()
        if existente:
            print("Los datos de ejemplo ya están cargados. No se hará nada.")
            return

        # ── Curso ────────────────────────────────────────────────────────────
        curso = Curso(
            nombre="Redes de Computadoras",
            codigo="IS-402",
            periodo="2025-3B",
            docente_email="profesor.test@uao.edu.co",
            ra_abet=[
                "RA1: Análisis de problemas de ingeniería",
                "RA2: Diseño de soluciones de ingeniería",
                "RA3: Trabajo en equipo",
            ],
            activo=True,
        )
        db.add(curso)
        db.flush()

        # ── Secciones ────────────────────────────────────────────────────────
        grupo_a = Seccion(nombre="Grupo A", curso_id=curso.id, activo=True)
        grupo_b = Seccion(nombre="Grupo B", curso_id=curso.id, activo=True)
        db.add_all([grupo_a, grupo_b])
        db.flush()

        # ── Estudiantes Grupo A ──────────────────────────────────────────────
        oscar = Estudiante(
            nombre_completo="OSCAR EVELIO PRADA CEBALLOS",
            codigo_estudiante="2021001",
            seccion_id=grupo_a.id,
        )
        andrea = Estudiante(
            nombre_completo="ANDREA PATRICIA MESA GIRALDO",
            codigo_estudiante="2021002",
            seccion_id=grupo_a.id,
        )
        carlos = Estudiante(
            nombre_completo="CARLOS MARIO RESTREPO VÉLEZ",
            codigo_estudiante="2021003",
            seccion_id=grupo_a.id,
        )
        db.add_all([oscar, andrea, carlos])
        db.flush()

        # ── Actividad ────────────────────────────────────────────────────────
        actividad = Actividad(
            nombre="Lab1: Cálculo de subredes",
            tipo=TipoActividad.grupal,
            peso_nota_final=Decimal("20.00"),
            curso_id=curso.id,
        )
        db.add(actividad)
        db.flush()

        # ── Aspectos y criterios ─────────────────────────────────────────────
        aspectos_data = [
            (
                "Cálculos de Subredes",
                1,
                [
                    ("Se calculó adecuadamente y se muestra claramente rango de direccionamiento de la primera subred", Decimal("10.00"), 1),
                    ("Se calculó adecuadamente y se muestra claramente rango de direccionamiento de la segunda subred", Decimal("10.00"), 2),
                    ("Se calculó adecuadamente y se muestra claramente rango de direccionamiento de la tercera subred", Decimal("10.00"), 3),
                ],
            ),
            (
                "Configuración de Interfaces",
                2,
                [
                    ("Se realizó el esquema de la red según el diagrama del requerimiento", Decimal("10.00"), 1),
                    ("Se configuró correctamente la puerta de enlace, el primer host utilizable y el ultimo utilizable de la primera subred", Decimal("10.00"), 2),
                    ("Se configuró correctamente la puerta de enlace, el primer host utilizable y el ultimo utilizable de la segunda subred", Decimal("10.00"), 3),
                    ("Se configuró correctamente la puerta de enlace, el primer host utilizable y el ultimo utilizable de la tercera subred", Decimal("10.00"), 4),
                ],
            ),
            (
                "Conectividad",
                3,
                [
                    ("Se puede realizar ping exitosamente entre los Host de la primera subred y la segunda subred", Decimal("10.00"), 1),
                    ("Se puede realizar ping exitosamente entre los Host de la primera subred y la tercera subred", Decimal("10.00"), 2),
                    ("Se puede realizar ping exitosamente entre los Host de la segunda subred y la tercera subred", Decimal("10.00"), 3),
                ],
            ),
        ]

        todos_criterios = []
        for nombre_aspecto, orden_aspecto, criterios_data in aspectos_data:
            aspecto = Aspecto(
                nombre=nombre_aspecto,
                actividad_id=actividad.id,
                orden=orden_aspecto,
            )
            db.add(aspecto)
            db.flush()
            for texto, peso, orden_criterio in criterios_data:
                criterio = Criterio(
                    texto=texto,
                    peso_porcentaje=peso,
                    aspecto_id=aspecto.id,
                    orden=orden_criterio,
                )
                db.add(criterio)
                todos_criterios.append(criterio)
        db.flush()

        # ── Equipos de trabajo (Grupo A, Lab1) ───────────────────────────────
        equipo1 = EquipoTrabajo(nombre="Equipo 1", actividad_id=actividad.id, seccion_id=grupo_a.id)
        equipo2 = EquipoTrabajo(nombre="Equipo 2", actividad_id=actividad.id, seccion_id=grupo_a.id)
        equipo3 = EquipoTrabajo(nombre="Equipo 3", actividad_id=actividad.id, seccion_id=grupo_a.id)
        db.add_all([equipo1, equipo2, equipo3])
        db.flush()

        # ── Miembros de equipo ────────────────────────────────────────────────
        db.add_all([
            MiembroEquipo(equipo_id=equipo1.id, estudiante_id=oscar.id),
            MiembroEquipo(equipo_id=equipo2.id, estudiante_id=andrea.id),
            MiembroEquipo(equipo_id=equipo3.id, estudiante_id=carlos.id),
        ])
        db.flush()

        # ── Calificaciones Equipo 1 (todos los criterios = 1, nota total = 5.0) ──
        for criterio in todos_criterios:
            nota_parcial = calcular_nota_parcial(1, criterio.peso_porcentaje)
            db.add(Calificacion(
                criterio_id=criterio.id,
                valor=1,
                equipo_id=equipo1.id,
                nota_calculada=nota_parcial,
            ))

        db.commit()

        print("✓ Datos de ejemplo cargados correctamente:")
        print(f"  Curso  : {curso.nombre} ({curso.codigo}) — {curso.periodo}")
        print(f"  Secciones: Grupo A (3 estudiantes), Grupo B (0 estudiantes)")
        print(f"  Actividad: {actividad.nombre} — tipo grupal, peso 20%")
        print(f"  Criterios: {len(todos_criterios)} criterios (suma 100%)")
        print(f"  Equipos  : Equipo 1 (calificado, nota 5.0), Equipo 2, Equipo 3 (pendientes)")

    except Exception as exc:
        db.rollback()
        print(f"ERROR al cargar datos de ejemplo: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
