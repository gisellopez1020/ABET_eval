from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # --- Enum tipo_actividad ---
    bind.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE tipo_actividad AS ENUM ('individual', 'grupal');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """))

    # --- cursos ---
    bind.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS cursos (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(200) NOT NULL,
            codigo VARCHAR(50) NOT NULL,
            periodo VARCHAR(20) NOT NULL,
            docente_email VARCHAR(200) NOT NULL,
            ra_abet JSON,
            activo BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_cursos_id ON cursos(id)"))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_cursos_docente_email ON cursos(docente_email)"))

    # --- secciones ---
    bind.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS secciones (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL,
            curso_id INTEGER NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
            activo BOOLEAN NOT NULL DEFAULT true
        )
    """))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_secciones_id ON secciones(id)"))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_secciones_curso_id ON secciones(curso_id)"))

    # --- estudiantes ---
    bind.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS estudiantes (
            id SERIAL PRIMARY KEY,
            nombre_completo VARCHAR(200) NOT NULL,
            codigo_estudiante VARCHAR(50) NOT NULL,
            seccion_id INTEGER NOT NULL REFERENCES secciones(id) ON DELETE CASCADE
        )
    """))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_estudiantes_id ON estudiantes(id)"))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_estudiantes_seccion_id ON estudiantes(seccion_id)"))

    # --- actividades ---
    bind.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS actividades (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(200) NOT NULL,
            tipo tipo_actividad NOT NULL,
            peso_nota_final NUMERIC(5,2) NOT NULL,
            curso_id INTEGER NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_actividades_id ON actividades(id)"))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_actividades_curso_id ON actividades(curso_id)"))

    # --- aspectos ---
    bind.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS aspectos (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(200) NOT NULL,
            actividad_id INTEGER NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
            orden INTEGER NOT NULL DEFAULT 0
        )
    """))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_aspectos_id ON aspectos(id)"))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_aspectos_actividad_id ON aspectos(actividad_id)"))

    # --- criterios ---
    bind.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS criterios (
            id SERIAL PRIMARY KEY,
            texto VARCHAR(500) NOT NULL,
            peso_porcentaje NUMERIC(5,2) NOT NULL,
            aspecto_id INTEGER NOT NULL REFERENCES aspectos(id) ON DELETE CASCADE,
            orden INTEGER NOT NULL DEFAULT 0,
            CONSTRAINT ck_criterio_peso_rango CHECK (peso_porcentaje >= 0 AND peso_porcentaje <= 100)
        )
    """))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_criterios_id ON criterios(id)"))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_criterios_aspecto_id ON criterios(aspecto_id)"))

    # --- equipos_trabajo ---
    bind.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS equipos_trabajo (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL,
            actividad_id INTEGER NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
            seccion_id INTEGER NOT NULL REFERENCES secciones(id) ON DELETE CASCADE
        )
    """))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_equipos_trabajo_id ON equipos_trabajo(id)"))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_equipos_trabajo_actividad_id ON equipos_trabajo(actividad_id)"))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_equipos_trabajo_seccion_id ON equipos_trabajo(seccion_id)"))

    # --- miembros_equipo ---
    bind.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS miembros_equipo (
            id SERIAL PRIMARY KEY,
            equipo_id INTEGER NOT NULL REFERENCES equipos_trabajo(id) ON DELETE CASCADE,
            estudiante_id INTEGER NOT NULL REFERENCES estudiantes(id) ON DELETE CASCADE,
            CONSTRAINT uq_miembro_equipo UNIQUE (equipo_id, estudiante_id)
        )
    """))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_miembros_equipo_id ON miembros_equipo(id)"))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_miembros_equipo_equipo_id ON miembros_equipo(equipo_id)"))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_miembros_equipo_estudiante_id ON miembros_equipo(estudiante_id)"))

    # --- calificaciones ---
    bind.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS calificaciones (
            id SERIAL PRIMARY KEY,
            criterio_id INTEGER NOT NULL REFERENCES criterios(id) ON DELETE CASCADE,
            valor SMALLINT NOT NULL,
            equipo_id INTEGER REFERENCES equipos_trabajo(id) ON DELETE CASCADE,
            estudiante_id INTEGER REFERENCES estudiantes(id) ON DELETE CASCADE,
            nota_calculada NUMERIC(6,4) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT ck_calificacion_xor_equipo_estudiante
                CHECK ((equipo_id IS NULL) != (estudiante_id IS NULL)),
            CONSTRAINT ck_calificacion_valor_binario
                CHECK (valor IN (0, 1)),
            CONSTRAINT ck_calificacion_nota_rango
                CHECK (nota_calculada >= 0.0 AND nota_calculada <= 5.0)
        )
    """))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_calificaciones_id ON calificaciones(id)"))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_calificaciones_criterio_id ON calificaciones(criterio_id)"))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_calificaciones_equipo_id ON calificaciones(equipo_id)"))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_calificaciones_estudiante_id ON calificaciones(estudiante_id)"))


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("DROP TABLE IF EXISTS calificaciones CASCADE"))
    bind.execute(sa.text("DROP TABLE IF EXISTS miembros_equipo CASCADE"))
    bind.execute(sa.text("DROP TABLE IF EXISTS equipos_trabajo CASCADE"))
    bind.execute(sa.text("DROP TABLE IF EXISTS criterios CASCADE"))
    bind.execute(sa.text("DROP TABLE IF EXISTS aspectos CASCADE"))
    bind.execute(sa.text("DROP TABLE IF EXISTS actividades CASCADE"))
    bind.execute(sa.text("DROP TABLE IF EXISTS estudiantes CASCADE"))
    bind.execute(sa.text("DROP TABLE IF EXISTS secciones CASCADE"))
    bind.execute(sa.text("DROP TABLE IF EXISTS cursos CASCADE"))
    bind.execute(sa.text("DROP TYPE IF EXISTS tipo_actividad"))