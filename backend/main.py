from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
    allow_origins=["http://localhost:5173", "http://frontend:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
