from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from app.config import settings

# Desde app.config (DATABASE_URL o el .env), no con os.getenv: así pasa por los
# validadores de Settings, incluido el de la contraseña de PostgreSQL
DATABASE_URL = settings.database_url

# hide_parameters: los errores de SQL (y sus trazas en los logs) no muestran los valores
# de la consulta, que pueden ser datos personales del estudiante (RNF-14)
engine = create_engine(DATABASE_URL, pool_pre_ping=True, hide_parameters=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
