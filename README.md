# ABET Eval

Sistema de evaluación por criterios ABET para la Universidad Autónoma de Occidente (UAO), Cali, Colombia.

## Funcionalidades principales

- Gestión de asignaturas, secciones y estudiantes, con importación masiva de estudiantes por CSV.
- Rúbricas de evaluación con aspectos y criterios ponderados (el peso de una actividad debe sumar exactamente 100%), construidas manualmente o importadas por CSV o Excel.
- Catálogo institucional de **Student Outcomes ABET**, con jerarquía de dos niveles (Resultado de Aprendizaje → Criterio de Evaluación), editable o importable por CSV.
- Vinculación opcional de cada aspecto de una rúbrica a un Criterio de Evaluación del catálogo, incluso en actividades que ya tienen calificaciones.
- Calificación individual o grupal, con gestión de equipos de trabajo por actividad.
- Reportes ABET en dos niveles (por Criterio de Evaluación y por Resultado de Aprendizaje), agregados por curso o acotados a una sección/actividad específica, con rangos de calificación configurables por curso.
- Exportación de reportes a PDF (con gráficas incluidas) y a Excel (resumen con hoja de conteo, y detalle por equipo o estudiante en el formato institucional real).
- Sincronización automática del reporte de detalle con Google Drive.
- Autenticación con Google OAuth 2.0, con modo simulado (`SKIP_AUTH`) para desarrollo local sin credenciales reales.

## Instalación para usar la app (sin programar)

Para quien solo va a usar la app en su computador, sin modificar el código. Ocupa y consume mucho menos que la instalación de desarrollo de la sección siguiente: el frontend va compilado y no hay recarga automática.

1. Instala [Docker Desktop](https://www.docker.com/products/docker-desktop/) y déjalo abierto.
2. Descarga el repositorio y crea el archivo de configuración:
   ```bash
   git clone https://github.com/gisellopez1020/ABET_eval.git
   cd ABET_eval
   cp .env.example .env
   ```
3. Levanta la app (la primera vez tarda unos minutos):
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
4. Abre http://localhost:5173. La base de datos se prepara sola al arrancar. Antes de crear cursos, carga el catálogo de Student Outcomes como se explica en el [paso 4](#4-cargar-el-catálogo-de-student-outcomes-abet).

La app vuelve a arrancar sola al reiniciar el computador mientras Docker Desktop esté abierto. Para detenerla: `docker compose -f docker-compose.prod.yml down`. Los datos se conservan; **no** agregues `-v` a ese comando, porque borra la base de datos.

Usa los mismos puertos que la instalación de desarrollo (5173 y 8000): no se pueden tener las dos levantadas a la vez.

## Instalación en 6 pasos

Para programar: monta el código en los contenedores y recarga los cambios al guardar.

### Requisitos previos
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y en ejecución
- Git

### 1. Clonar el repositorio y configurar variables de entorno

```bash
git clone https://github.com/gisellopez1020/ABET_eval.git
cd ABET_eval
cp .env.example .env
```

Edita `.env` si necesitas cambiar contraseñas. Para desarrollo local, los valores por defecto funcionan sin modificación.

### 2. Levantar los servicios

```bash
docker-compose up -d --build
```

Espera ~30 segundos a que PostgreSQL esté listo. Puedes verificar con:
```bash
docker-compose logs postgres
```

### 3. Ejecutar migraciones de base de datos

```bash
docker-compose exec backend alembic upgrade head
```

### 4. Cargar el catálogo de Student Outcomes ABET

El catálogo de Resultados de Aprendizaje y Criterios de Evaluación **no se carga por migración** — se administra desde la propia aplicación, para que cualquier programa académico pueda mantener el suyo. El script de datos de ejemplo del paso 5 depende de que este catálogo ya exista, así que hay que cargarlo primero:

1. Abre http://localhost:5173. Con `SKIP_AUTH=true` (el valor de `.env.example` y `docker-compose.yml`), el botón "Iniciar sesión con Google" entra directo, sin credenciales reales. Ese modo es solo para localhost: el backend no arranca con `SKIP_AUTH=true` si `GOOGLE_REDIRECT_URI`, `FRONTEND_URL` o `FRONTEND_ORIGINS` apuntan a un dominio real.
2. Ve a **Student Outcomes** en el menú lateral.
3. Pulsa **Importar CSV** y sube [`backend/scripts/student_outcomes_ingenieria_informatica.csv`](./backend/scripts/student_outcomes_ingenieria_informatica.csv), incluido en el repositorio. Contiene los 8 Resultados de Aprendizaje y 17 Criterios de Evaluación del programa de Ingeniería Informática de la UAO.

### 5. Cargar datos de ejemplo

```bash
docker-compose exec backend python scripts/seed.py
```

Carga el curso real "Redes De Datos" (545210, período 2026-1), con 2 secciones, 6 equipos de trabajo (20 estudiantes en total, con nombres ficticios) y la rúbrica completa de la actividad "Proyecto Final I", ya calificada para los 6 equipos. Si el paso 4 no se completó antes, este script se detiene con un error indicando qué códigos ABET faltan en el catálogo.

### 6. Abrir la aplicación

- **Frontend:** http://localhost:5173
- **API Swagger:** http://localhost:8000/docs

Para configurar el login real con Google y la sincronización con Google Drive (no necesario con `SKIP_AUTH=true`), consulta [SETUP_GOOGLE.md](./SETUP_GOOGLE.md).

---

## Pruebas del backend

Las pruebas usan SQLite en memoria: no necesitan PostgreSQL ni datos cargados. Se pueden correr de dos formas.

**Dentro del contenedor** (con los servicios levantados):
```bash
docker-compose exec backend pytest
```

**Con un entorno virtual local** (desde `backend/`):
```bash
python -m venv venv
venv\Scripts\python -m pip install -r requirements.txt   # Linux/macOS: venv/bin/python -m pip ...
venv\Scripts\python -m pytest                            # Linux/macOS: venv/bin/python -m pytest
```

Con el entorno ya creado, solo hace falta la última línea. Para correr un solo archivo: `pytest tests/test_estadisticas.py`.

---

## Credenciales de desarrollo

| Campo | Valor |
|-------|-------|
| Usuario mock | `profesor.test@uao.edu.co` |
| `SKIP_AUTH` | `true` (solo localhost; en un despliegue, `false`) |
| BD host | `localhost:5432` |
| BD nombre | `abet_eval` |
| BD usuario | `abet` |
| BD contraseña | `abet_pass` |
| Curso de ejemplo (tras el seed) | Redes De Datos — 545210 — período 2026-1 |

---

## Estructura del proyecto

```
ABET_eval/
├── docker-compose.yml            # Desarrollo (código montado, recarga al guardar)
├── docker-compose.prod.yml       # Instalación para usar la app
├── .env.example
├── SETUP_GOOGLE.md
├── backend/                      # FastAPI + Python 3.11
│   ├── main.py
│   ├── app/
│   │   ├── auth/                 # Middleware y dependencias de autenticación
│   │   ├── models/               # Modelos SQLAlchemy
│   │   ├── schemas/               # Esquemas Pydantic
│   │   ├── routers/               # Endpoints por módulo (auth, cursos, secciones,
│   │   │                          #   estudiantes, actividades, criterios, equipos,
│   │   │                          #   calificaciones, reportes, catalogo, drive)
│   │   ├── services/              # Lógica de negocio: Google OAuth, Google Drive,
│   │   │                          #   generación de Excel, cálculo de promedios
│   │   └── utils/                 # Cálculo de notas, parseo de Excel
│   ├── alembic/                  # Migraciones de base de datos
│   ├── scripts/                  # seed.py y el CSV del catálogo ABET
│   └── tests/                    # Pruebas unitarias y de integración (pytest)
└── frontend/                     # React 18 + TypeScript + Vite
    ├── Dockerfile.prod           # Compila y sirve con nginx (nginx.conf: proxy de /api)
    └── src/
        ├── pages/                # Una carpeta por pantalla: Login, Auth, Dashboard,
        │                         #   Course, Section, students, rubrica,
        │                         #   StudentOutcomes, Proyects, evaluaciones,
        │                         #   Grading, Reports, Estadisticas, Ayuda
        ├── components/           # Componentes UI reutilizables y de layout
        ├── store/                # Estado global (Zustand): sesión, curso activo, layout
        ├── api/                  # Cliente HTTP por módulo del backend
        ├── utils/                # Cálculos y utilidades puras del frontend
        └── types/                # Tipos compartidos
```
