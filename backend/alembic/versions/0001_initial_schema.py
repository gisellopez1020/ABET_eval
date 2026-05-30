"""Esquema inicial — todas las tablas ABET Eval

Revision ID: 0001
Revises:
Create Date: 2026-05-30

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Enum tipo_actividad ---
    op.execute("CREATE TYPE tipo_actividad AS ENUM ('individual', 'grupal')")

    # --- cursos ---
    op.create_table(
        "cursos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(200), nullable=False),
        sa.Column("codigo", sa.String(50), nullable=False),
        sa.Column("periodo", sa.String(20), nullable=False),
        sa.Column("docente_email", sa.String(200), nullable=False),
        sa.Column("ra_abet", sa.JSON(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cursos_id", "cursos", ["id"])
    op.create_index("ix_cursos_docente_email", "cursos", ["docente_email"])

    # --- secciones ---
    op.create_table(
        "secciones",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(100), nullable=False),
        sa.Column("curso_id", sa.Integer(), nullable=False),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default="true"),
        sa.ForeignKeyConstraint(["curso_id"], ["cursos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_secciones_id", "secciones", ["id"])
    op.create_index("ix_secciones_curso_id", "secciones", ["curso_id"])

    # --- estudiantes ---
    op.create_table(
        "estudiantes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre_completo", sa.String(200), nullable=False),
        sa.Column("codigo_estudiante", sa.String(50), nullable=False),
        sa.Column("seccion_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["seccion_id"], ["secciones.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_estudiantes_id", "estudiantes", ["id"])
    op.create_index("ix_estudiantes_seccion_id", "estudiantes", ["seccion_id"])

    # --- actividades ---
    op.create_table(
        "actividades",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(200), nullable=False),
        sa.Column("tipo", sa.Enum("individual", "grupal", name="tipo_actividad"), nullable=False),
        sa.Column("peso_nota_final", sa.Numeric(5, 2), nullable=False),
        sa.Column("curso_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["curso_id"], ["cursos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_actividades_id", "actividades", ["id"])
    op.create_index("ix_actividades_curso_id", "actividades", ["curso_id"])

    # --- aspectos ---
    op.create_table(
        "aspectos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(200), nullable=False),
        sa.Column("actividad_id", sa.Integer(), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["actividad_id"], ["actividades.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_aspectos_id", "aspectos", ["id"])
    op.create_index("ix_aspectos_actividad_id", "aspectos", ["actividad_id"])

    # --- criterios ---
    op.create_table(
        "criterios",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("texto", sa.String(500), nullable=False),
        sa.Column("peso_porcentaje", sa.Numeric(5, 2), nullable=False),
        sa.Column("aspecto_id", sa.Integer(), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint("peso_porcentaje >= 0 AND peso_porcentaje <= 100", name="ck_criterio_peso_rango"),
        sa.ForeignKeyConstraint(["aspecto_id"], ["aspectos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_criterios_id", "criterios", ["id"])
    op.create_index("ix_criterios_aspecto_id", "criterios", ["aspecto_id"])

    # --- equipos_trabajo ---
    op.create_table(
        "equipos_trabajo",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(100), nullable=False),
        sa.Column("actividad_id", sa.Integer(), nullable=False),
        sa.Column("seccion_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["actividad_id"], ["actividades.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["seccion_id"], ["secciones.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_equipos_trabajo_id", "equipos_trabajo", ["id"])
    op.create_index("ix_equipos_trabajo_actividad_id", "equipos_trabajo", ["actividad_id"])
    op.create_index("ix_equipos_trabajo_seccion_id", "equipos_trabajo", ["seccion_id"])

    # --- miembros_equipo ---
    op.create_table(
        "miembros_equipo",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("equipo_id", sa.Integer(), nullable=False),
        sa.Column("estudiante_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["equipo_id"], ["equipos_trabajo.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["estudiante_id"], ["estudiantes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("equipo_id", "estudiante_id", name="uq_miembro_equipo"),
    )
    op.create_index("ix_miembros_equipo_id", "miembros_equipo", ["id"])
    op.create_index("ix_miembros_equipo_equipo_id", "miembros_equipo", ["equipo_id"])
    op.create_index("ix_miembros_equipo_estudiante_id", "miembros_equipo", ["estudiante_id"])

    # --- calificaciones ---
    op.create_table(
        "calificaciones",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("criterio_id", sa.Integer(), nullable=False),
        sa.Column("valor", sa.SmallInteger(), nullable=False),
        sa.Column("equipo_id", sa.Integer(), nullable=True),
        sa.Column("estudiante_id", sa.Integer(), nullable=True),
        sa.Column("nota_calculada", sa.Numeric(6, 4), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "(equipo_id IS NULL) != (estudiante_id IS NULL)",
            name="ck_calificacion_xor_equipo_estudiante",
        ),
        sa.CheckConstraint("valor IN (0, 1)", name="ck_calificacion_valor_binario"),
        sa.CheckConstraint(
            "nota_calculada >= 0.0 AND nota_calculada <= 5.0",
            name="ck_calificacion_nota_rango",
        ),
        sa.ForeignKeyConstraint(["criterio_id"], ["criterios.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["equipo_id"], ["equipos_trabajo.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["estudiante_id"], ["estudiantes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_calificaciones_id", "calificaciones", ["id"])
    op.create_index("ix_calificaciones_criterio_id", "calificaciones", ["criterio_id"])
    op.create_index("ix_calificaciones_equipo_id", "calificaciones", ["equipo_id"])
    op.create_index("ix_calificaciones_estudiante_id", "calificaciones", ["estudiante_id"])


def downgrade() -> None:
    op.drop_table("calificaciones")
    op.drop_table("miembros_equipo")
    op.drop_table("equipos_trabajo")
    op.drop_table("criterios")
    op.drop_table("aspectos")
    op.drop_table("actividades")
    op.drop_table("estudiantes")
    op.drop_table("secciones")
    op.drop_table("cursos")
    op.execute("DROP TYPE tipo_actividad")
