from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.dependencies import CSRF_HEADER
from app.config import settings
from app.archivos import LimiteCuerpoSubidas
from app.errores_http import registrar_manejadores
from app.routers import auth, cursos, secciones, estudiantes, actividades
from app.routers import criterios, equipos, calificaciones, reportes, catalogo

app = FastAPI(
    title="ABET Eval API",
    description="Sistema de evaluación por criterios ABET — Universidad Autónoma de Occidente",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    # Orígenes desde FRONTEND_ORIGINS (nunca "*": la sesión viaja en cookie)
    allow_origins=settings.lista_frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Content-Type", CSRF_HEADER],
)

# Corta las subidas de archivos demasiado grandes antes de que lleguen al disco
app.add_middleware(LimiteCuerpoSubidas)

# Errores de negocio de los servicios -> respuestas HTTP (404, 403, 409)
registrar_manejadores(app)

app.include_router(auth.router)
app.include_router(cursos.router)
app.include_router(secciones.router)
app.include_router(estudiantes.router)
app.include_router(actividades.router)
app.include_router(criterios.router)
app.include_router(equipos.router)
app.include_router(calificaciones.router)
app.include_router(reportes.router)
app.include_router(catalogo.router)


@app.get("/health", tags=["Estado"])
def health_check():
    """Verificación de estado del servicio."""
    return {"status": "ok", "servicio": "ABET Eval API"}
