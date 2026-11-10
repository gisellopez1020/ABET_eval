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

**Para usarla con el inicio de sesión real de Google y Google Drive (un docente en su computador con Windows), sigue el [manual de inicio rápido](./MANUAL_INICIO_RAPIDO.md)**: incluye el `.env` completo, las claves, el respaldo cifrado y qué hacer si algo falla. Lo que sigue es la versión corta, con el modo demo.

Para quien solo va a usar la app en su computador, sin modificar el código. Ocupa y consume mucho menos que la instalación de desarrollo de la sección siguiente: el frontend va compilado y no hay recarga automática.

1. Instala [Docker Desktop](https://www.docker.com/products/docker-desktop/) y déjalo abierto.
2. Descarga el repositorio y crea el archivo de configuración:
   ```bash
   git clone https://github.com/gisellopez1020/ABET_eval.git
   cd ABET_eval
   cp .env.example .env
   ```
   **Antes del primer arranque, pon tu propia contraseña de la base de datos** en `POSTGRES_PASSWORD` del `.env` (mínimo 12 caracteres). Con el login real de Google (`SKIP_AUTH=false`) el backend no arranca con la de ejemplo, `abet_pass`, y una vez creada la base ya no cambia editando el `.env`. Para generarla en PowerShell:
   ```powershell
   $b = New-Object byte[] 18; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b).Replace('+','-').Replace('/','_')
   ```
   Si ya tenías la app instalada con `abet_pass`, sigue el paso a paso de [DESPLIEGUE_PRODUCCION.md](./DESPLIEGUE_PRODUCCION.md), sección 11 (con respaldo previo).
3. Levanta la app (la primera vez tarda unos minutos):
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
4. Abre http://localhost:5173. La base de datos se prepara sola al arrancar. Antes de crear cursos, carga el catálogo de Student Outcomes como se explica en el [paso 3](#3-cargar-el-catálogo-de-student-outcomes-abet).

Con el login real, la sesión se cierra sola tras 8 horas sin usar la app (y como máximo a las 24 horas de iniciarla); basta con volver a entrar con Google. Al actualizar a la versión 1.0.0 hay que iniciar sesión una vez más.

La app vuelve a arrancar sola al reiniciar el computador mientras Docker Desktop esté abierto. Para detenerla: `docker compose -f docker-compose.prod.yml down`. Los datos se conservan; **no** agregues `-v` a ese comando, porque borra la base de datos.

Usa los mismos puertos que la instalación de desarrollo (5173 y 8000): no se pueden tener las dos levantadas a la vez.

Para instalar la app en un servidor de la universidad, con HTTPS y login real, ver [DESPLIEGUE_PRODUCCION.md](./DESPLIEGUE_PRODUCCION.md).

El nombre, el código y el correo de los estudiantes se guardan cifrados si configuras `DATA_ENCRYPTION_KEY` en el `.env` (obligatoria con `SKIP_AUTH=false`; ver [SETUP_GOOGLE.md](./SETUP_GOOGLE.md), paso 5). Sin ella se guardan sin cifrar y el backend lo avisa al arrancar. **Si esa clave se pierde, esos datos no se pueden recuperar.**

## Instalación en 5 pasos

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

Espera ~30 segundos a que PostgreSQL esté listo. El backend ejecuta las migraciones
automáticamente al iniciar. Puedes verificar que la base de datos esté lista con:
```bash
docker-compose logs postgres
```

Si necesitas ejecutar las migraciones manualmente:

```bash
docker-compose exec backend alembic upgrade head
```

### 3. Cargar el catálogo de Student Outcomes ABET

El catálogo de Resultados de Aprendizaje y Criterios de Evaluación **no se carga por migración** — se administra desde la propia aplicación, para que cualquier programa académico pueda mantener el suyo. El script de datos de ejemplo del paso 5 depende de que este catálogo ya exista, así que hay que cargarlo primero:

1. Abre http://localhost:5173. Con `SKIP_AUTH=true` (el valor de `.env.example` y `docker-compose.yml`), el botón "Iniciar sesión con Google" entra directo, sin credenciales reales. Ese modo es solo para localhost: el backend no arranca con `SKIP_AUTH=true` si `GOOGLE_REDIRECT_URI`, `FRONTEND_URL` o `FRONTEND_ORIGINS` apuntan a un dominio real.
2. Ve a **Student Outcomes** en el menú lateral.
3. Pulsa **Importar CSV**, selecciona la colección de la carrera correspondiente (o crea una nueva) y sube el archivo CSV. Cada carrera puede tener sus propios resultados aunque reutilice códigos como `1.1`; la importación solo actualiza la colección seleccionada. Para consultar lo cargado, selecciona la carrera en el desplegable de la pantalla; la tabla mostrará solo sus Resultados de Aprendizaje y Criterios. El archivo [`backend/scripts/student_outcomes_ingenieria_informatica.csv`](./backend/scripts/student_outcomes_ingenieria_informatica.csv) contiene los 8 Resultados de Aprendizaje y 17 Criterios de Evaluación del programa de Ingeniería Informática de la UAO.

### 4. Cargar datos de ejemplo

```bash
docker-compose exec backend python scripts/seed.py
```

Carga el curso real "Redes De Datos" (545210, período 2026-1), con 2 secciones, 6 equipos de trabajo (20 estudiantes en total, con nombres ficticios) y la rúbrica completa de la actividad "Proyecto Final I", ya calificada para los 6 equipos. Si el paso 3 no se completó antes, este script se detiene con un error indicando qué códigos ABET faltan en el catálogo.

### 5. Abrir la aplicación

- **Frontend:** http://localhost:5173
- **API Swagger:** http://localhost:8000/docs

Para configurar el login real con Google y la sincronización con Google Drive (no necesario con `SKIP_AUTH=true`), consulta [SETUP_GOOGLE.md](./SETUP_GOOGLE.md).

---

## Pruebas del backend

Las pruebas usan SQLite en memoria: no necesitan PostgreSQL ni datos cargados. Se pueden correr de dos formas.

**Dentro del contenedor** (con los servicios de desarrollo levantados, `docker-compose.yml`):
```bash
docker-compose exec backend pytest
```

Funciona porque `docker-compose.yml` construye la etapa `dev` del Dockerfile (con pytest, de `requirements-dev.txt`), monta `./backend` con las pruebas y la raíz del repo en `/repo` (solo lectura) para las que revisan `.env.example` y los docker-compose. La imagen de `docker-compose.prod.yml` **no** trae pruebas ni pytest.

**Con un entorno virtual local** (desde `backend/`), con **Python 3.13**, la versión de la imagen:
```bash
py -3.13 -m venv venv                                        # Linux/macOS: python3.13 -m venv venv
venv\Scripts\python -m pip install -r requirements-dev.txt   # Linux/macOS: venv/bin/python -m pip ...
venv\Scripts\python -m pytest                                # Linux/macOS: venv/bin/python -m pytest
```

Con el entorno ya creado, solo hace falta la última línea. `requirements-dev.txt` incluye `requirements.txt` y añade pytest. Para correr un solo archivo: `pytest tests/test_estadisticas.py`.

---

## Pruebas del frontend

Con **Node 22 o superior** (las imágenes usan Node 24; `frontend/.nvmrc`), desde `frontend/`:

```bash
npm ci
npx vitest run
```

`npm ci` instala exactamente las versiones de `package-lock.json`: úsalo también después de cada `git pull` que cambie dependencias (con un `node_modules` viejo las pruebas fallan).

---

## Integración continua (GitHub Actions)

Cada Pull Request y cada push a `main` ejecutan el workflow **CI** (`.github/workflows/ci.yml`), que corre **solo la parte que cambió**:

| Job | Cuándo corre | Qué hace |
|-----|--------------|----------|
| `changes` | Siempre | Detecta qué cambió (backend, frontend, imágenes, infraestructura). |
| `backend` | `backend/**`, los `nginx*`, `Dockerfile*` y `.dockerignore` del frontend, `.env.example` (las pruebas del backend los validan) | Python 3.13: `pytest` con cobertura. La cobertura sale en el resumen de la ejecución; si falla, se guardan `junit.xml` y `coverage.xml` 7 días. |
| `frontend` | `frontend/**` | Node 24 (`frontend/.nvmrc`): `npm ci`, `npm run build` (tsc + vite) y Vitest. Cada prueba fallida aparece anotada en el PR. |
| `docker-build` | Dockerfile, `.dockerignore`, dependencias o `nginx*` | Construye las imágenes de producción, sin publicarlas. |
| `ci-ok` | Siempre | Falla si algún job falló o se canceló, o si `changes` no corrió. **Es la única comprobación requerida para fusionar en `main`.** |

Un cambio en `.github/`, `docker-compose*.yml` o `scripts/` ejecuta todo; uno solo de documentación ejecuta solo `changes` y `ci-ok` (menos de un minuto). Las pruebas no necesitan secretos, red ni `.env`.

**Relanzar todo a mano:** en GitHub, pestaña **Actions** → **CI** (a la izquierda) → **Run workflow** → elegir la rama → **Run workflow**. Así se ejecutan todos los jobs, aunque no haya cambios. Para repetir una ejecución que falló, ábrela y pulsa **Re-run jobs** → **Re-run failed jobs**.

Además:

- **Seguridad** (`.github/workflows/seguridad.yml`): los lunes, `pip-audit` sobre `backend/requirements.txt` y `npm audit --omit=dev` sobre el frontend. No bloquea los PR; si encuentra algo, GitHub avisa por correo. También se lanza a mano con **Run workflow**.
- **Dependabot** (`.github/dependabot.yml`): los lunes abre un PR agrupado por ecosistema (pip, npm, Docker, docker-compose, acciones) con versiones minor y patch. Las versiones mayores se actualizan a mano; los parches de seguridad llegan igual.

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
├── .github/                      # CI (workflows de GitHub Actions) y Dependabot
├── docker-compose.yml            # Desarrollo (código montado, recarga al guardar)
├── docker-compose.prod.yml       # Instalación para usar la app
├── docker-compose.https.yml      # Producción: encima de prod.yml, TLS en nginx
├── docker-compose.detras-de-proxy.yml  # Producción: TLS en el proxy de la universidad
├── .env.example
├── SETUP_GOOGLE.md
├── DESPLIEGUE_PRODUCCION.md      # Guía para TI: HTTPS, certificados, verificación
├── MANUAL_INICIO_RAPIDO.md       # Manual del docente: instalar, usar, respaldar (Windows)
├── SECURITY.md                   # Cómo reportar vulnerabilidades y controles implementados
├── CHANGELOG.md                  # Registro de cambios por versión
├── THIRD_PARTY_LICENSES.md       # Licencias de las dependencias de producción
├── scripts/                      # generar-cert-prueba (certificado SOLO para pruebas)
├── backend/                      # FastAPI + Python 3.13
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
