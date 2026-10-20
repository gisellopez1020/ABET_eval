"""Permitir códigos Student Outcome iguales en carreras diferentes."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        raise RuntimeError("La migración 0008 requiere PostgreSQL.")

    op.add_column("aspectos", sa.Column("programa_abet", sa.String(length=200), nullable=True))
    op.execute(sa.text("""
        UPDATE aspectos
        SET programa_abet = cursos.programa
        FROM actividades
        JOIN cursos ON cursos.id = actividades.curso_id
        WHERE actividades.id = aspectos.actividad_id
          AND aspectos.codigo_abet IS NOT NULL
    """))

    op.drop_constraint("fk_aspectos_codigo_abet", "aspectos", type_="foreignkey")
    op.drop_constraint("fk_ra_abet_catalogo_padre", "ra_abet_catalogo", type_="foreignkey")
    op.drop_constraint("ra_abet_catalogo_pkey", "ra_abet_catalogo", type_="primary")

    op.execute(sa.text("""
        CREATE TEMPORARY TABLE ra_abet_catalogo_copias (
            programa VARCHAR(200) NOT NULL,
            codigo VARCHAR(20) NOT NULL,
            PRIMARY KEY (programa, codigo)
        ) ON COMMIT DROP
    """))
    op.execute(sa.text("""
        INSERT INTO ra_abet_catalogo_copias (programa, codigo)
        SELECT DISTINCT aspectos.programa_abet, aspectos.codigo_abet
        FROM aspectos
        WHERE aspectos.codigo_abet IS NOT NULL
    """))
    op.execute(sa.text("""
        INSERT INTO ra_abet_catalogo_copias (programa, codigo)
        SELECT DISTINCT cursos.programa, outcome.codigo
        FROM cursos
        CROSS JOIN LATERAL json_array_elements_text(
            CASE WHEN json_typeof(cursos.ra_abet) = 'array'
                 THEN cursos.ra_abet ELSE '[]'::json END
        ) AS outcome(codigo)
        ON CONFLICT DO NOTHING
    """))
    op.execute(sa.text("""
        INSERT INTO ra_abet_catalogo_copias (programa, codigo)
        SELECT DISTINCT child.programa, child.codigo_padre
        FROM ra_abet_catalogo child
        JOIN ra_abet_catalogo parent ON parent.codigo = child.codigo_padre
        WHERE child.codigo_padre IS NOT NULL AND child.programa <> parent.programa
        ON CONFLICT DO NOTHING
    """))
    op.execute(sa.text("""
        INSERT INTO ra_abet_catalogo_copias (programa, codigo)
        SELECT DISTINCT copy.programa, source.codigo_padre
        FROM ra_abet_catalogo_copias copy
        JOIN ra_abet_catalogo source ON source.codigo = copy.codigo
        WHERE source.codigo_padre IS NOT NULL AND copy.programa <> source.programa
        ON CONFLICT DO NOTHING
    """))
    op.execute(sa.text("""
        INSERT INTO ra_abet_catalogo (
            codigo, so, competencia, descripcion, programa, codigo_padre, peso
        )
        SELECT source.codigo, source.so, source.competencia, source.descripcion,
               copy.programa, source.codigo_padre, source.peso
        FROM ra_abet_catalogo_copias copy
        JOIN ra_abet_catalogo source ON source.codigo = copy.codigo
        WHERE source.programa <> copy.programa
          AND NOT EXISTS (
              SELECT 1 FROM ra_abet_catalogo target
              WHERE target.programa = copy.programa AND target.codigo = copy.codigo
          )
    """))

    op.create_primary_key(
        "pk_ra_abet_catalogo",
        "ra_abet_catalogo",
        ["programa", "codigo"],
    )
    op.create_foreign_key(
        "fk_ra_abet_catalogo_padre",
        "ra_abet_catalogo",
        "ra_abet_catalogo",
        ["programa", "codigo_padre"],
        ["programa", "codigo"],
    )
    op.create_foreign_key(
        "fk_aspectos_programa_codigo_abet",
        "aspectos",
        "ra_abet_catalogo",
        ["programa_abet", "codigo_abet"],
        ["programa", "codigo"],
    )
    op.create_index(
        "ix_aspectos_programa_codigo_abet",
        "aspectos",
        ["programa_abet", "codigo_abet"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    duplicates = bind.execute(sa.text("""
        SELECT codigo
        FROM ra_abet_catalogo
        GROUP BY codigo
        HAVING COUNT(*) > 1
        LIMIT 1
    """)).first()
    if duplicates:
        raise RuntimeError("No se puede revertir 0008: hay códigos repetidos entre carreras.")

    op.drop_index("ix_aspectos_programa_codigo_abet", table_name="aspectos")
    op.drop_constraint("fk_aspectos_programa_codigo_abet", "aspectos", type_="foreignkey")
    op.drop_constraint("fk_ra_abet_catalogo_padre", "ra_abet_catalogo", type_="foreignkey")
    op.drop_constraint("pk_ra_abet_catalogo", "ra_abet_catalogo", type_="primary")
    op.create_primary_key("ra_abet_catalogo_pkey", "ra_abet_catalogo", ["codigo"])
    op.create_foreign_key(
        "fk_ra_abet_catalogo_padre",
        "ra_abet_catalogo",
        "ra_abet_catalogo",
        ["codigo_padre"],
        ["codigo"],
    )
    op.create_foreign_key(
        "fk_aspectos_codigo_abet",
        "aspectos",
        "ra_abet_catalogo",
        ["codigo_abet"],
        ["codigo"],
    )
    op.drop_column("aspectos", "programa_abet")
