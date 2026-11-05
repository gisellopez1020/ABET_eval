from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Importar todos los modelos para que Alembic los detecte
from app.models.base import Base
from app.models import (  # noqa: F401
    Curso, Seccion, Estudiante, Actividad, Aspecto,
    Criterio, EquipoTrabajo, MiembroEquipo, Calificacion, RaAbetCatalogo,
)

target_metadata = Base.metadata

# La misma URL que la app (app.config.settings, que lee DATABASE_URL y el .env). Al
# importarla se validan los Settings: con SKIP_AUTH=false y la contraseña de ejemplo de
# PostgreSQL el arranque se detiene aquí, antes de migrar, con el mensaje que dice qué
# hacer. "%" se duplica porque alembic.ini usa interpolación de configparser.
from app.config import settings  # noqa: E402

config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
