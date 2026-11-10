# Registro de cambios

Todos los cambios relevantes del proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto
usa [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido

- **Estudiantes repetidos:** la importación (CSV o Excel) omite las filas cuyo código ya
  tiene un estudiante de la sección o que repiten el código de una fila anterior del
  archivo, y avisa cuántas y cuáles. La vista previa las muestra antes de importar,
  con el nombre que se conserva y el que se descarta. El código se compara sin espacios,
  sin distinguir mayúsculas y, si es numérico, sin ceros a la izquierda (`00123` = `123`,
  como lo guarda Excel); se guarda tal como viene. El mismo código en otra sección se
  permite, y el mismo nombre con otro código solo genera un aviso.

### Cambiado

- El alta y la edición manual de un estudiante responden **409** si otro estudiante de la
  sección ya tiene ese código (antes se guardaba repetido). Los repetidos que ya existían
  no se tocan y se pueden seguir editando sin cambiar su código.
- La respuesta de la importación trae `omitidos` (cantidad) y la de la vista previa,
  `omitidos` (filas, con su motivo). Son campos nuevos: los existentes no cambian.

## [1.0.0] - 2026-11-05

Primera versión publicada. Reúne el desarrollo desde el inicio del proyecto (mayo de 2026),
reconstruido a partir del historial de git.

### Notas de actualización (instalaciones anteriores a 1.0.0)

- **Cada docente debe iniciar sesión una vez más.** Las sesiones emitidas antes de esta
  versión no traen el tope absoluto (`ses_max`) que exige RNF-16 y se rechazan; el
  frontend lleva al login.
- **Con `SKIP_AUTH=false`, el backend no arranca si PostgreSQL usa la contraseña de
  ejemplo** (`abet_pass`), `PLACEHOLDER` o una de menos de 12 caracteres. Hay que
  cambiarla también dentro de PostgreSQL, porque el volumen guarda la inicial:
  [DESPLIEGUE_PRODUCCION.md](./DESPLIEGUE_PRODUCCION.md), «Contraseña de PostgreSQL».
- `JWT_EXPIRE_MINUTES` queda **obsoleta** y se ignora (con un aviso en el log). La
  reemplazan `SESION_INACTIVIDAD_MINUTOS` (480) y `SESION_DURACION_MAXIMA_MINUTOS` (1440).
- El backend pasa a **Python 3.13** y corre con un usuario sin privilegios. Reconstruir
  las imágenes: `docker compose ... up -d --build`.
- En modo HTTPS, `FRONTEND_URL` es obligatoria también para docker compose (la usa el
  healthcheck de nginx).

### Añadido

- **Cursos (asignaturas):** creación, edición, cierre y activación; período académico;
  rangos de calificación configurables por curso; vínculo con Resultados de Aprendizaje.
- **Secciones y estudiantes:** alta manual con correo opcional; importación desde CSV o
  Excel con vista previa, incluido el formato del director de TG; exportación a Excel;
  promedio ponderado real por estudiante; filtros por asignatura y sección; orden
  alfabético en español.
- **Actividades y rúbricas:** actividades para todas las secciones o solo algunas;
  edición completa de la rúbrica; importación de aspectos y criterios desde CSV o Excel
  con vista previa; aspectos vinculados a criterios ABET, incluso con calificaciones.
- **Equipos y proyectos:** creación y edición con buscador de estudiantes; eliminación
  (409 si tiene calificaciones); avance según los criterios calificados.
- **Calificación:** por equipo o por estudiante, con navegación entre ítems pendientes;
  calificación masiva; retroalimentación estructurada y, opcionalmente, redactada con IA
  (Gemini), también incluida en el Excel de detalle.
- **Catálogo de Student Outcomes:** jerarquía de Resultados de Aprendizaje y Criterios
  por carrera, con edición e importación CSV.
- **Reportes ABET:** dos niveles (criterio y resultado de aprendizaje), con gráficas;
  exportación a PDF (con el logo de la UAO) y a Excel (resumen y detalle con openpyxl);
  subida a Google Drive.
- **Panel principal y estadísticas:** actividad reciente, cumplimiento por resultado de
  aprendizaje y pantalla de estadísticas con exportación a Excel y Drive.
- **Ayuda:** guía de uso por módulo.
- **Login con Google** (OAuth 2.0) y sincronización con Google Drive; la sesión de Drive
  sobrevive a los reinicios del backend.
- **Instalación con Docker:** una para desarrollo (`docker-compose.yml`) y otra para usar
  la app (`docker-compose.prod.yml`), con migraciones automáticas al arrancar.
- **Modo HTTPS** (RNF-13): nginx con TLS 1.2/1.3 (`docker-compose.https.yml`) y variante
  detrás del proxy de la universidad (`docker-compose.detras-de-proxy.yml`).
- `SECURITY.md`, `THIRD_PARTY_LICENSES.md` (inventario de licencias de producción) y este
  registro de cambios.

### Seguridad

- **Sesión con expiración por inactividad (RNF-16):** vence tras 8 h sin actividad, con
  un tope absoluto de 24 h desde el login; la renovación conserva el token CSRF.
- Sesión en cookie httpOnly con protección CSRF y CORS con orígenes explícitos; validación
  del `state` de OAuth; JWT con algoritmo fijo (HS256) y `exp` obligatorio (PyJWT en vez de
  python-jose).
- Cifrado en reposo del nombre, el código y el correo de los estudiantes (RNF-14) y del
  acceso a Google Drive.
- Validadores de configuración: el backend no arranca con secretos o claves de ejemplo,
  con la contraseña de ejemplo de PostgreSQL, con URLs http fuera de esta máquina ni con
  `SKIP_AUTH=true` en un dominio real.
- Límites de tamaño de las subidas (incluidas las bombas zip) y **límite de intentos
  (429) en nginx** para el login y las subidas de archivos.
- Protección contra la inyección de fórmulas en los Excel exportados.
- Contenedores endurecidos: usuario sin privilegios en el backend, `no-new-privileges`,
  healthchecks, imágenes base con versión fija, sin pruebas ni pytest en la imagen de
  producción, `.dockerignore` que excluye `.env`, certificados y pruebas.
- Cabeceras de seguridad (HSTS, CSP, X-Frame-Options y otras) en los modos de producción.

### Cambiado

- Backend en Python 3.13 (antes 3.11); FastAPI 0.162, Starlette 1.10, Pydantic 2.14,
  SQLAlchemy 2.0.57, psycopg2-binary 2.9.13, openpyxl 3.1.5, Pillow 13.
- Frontend: imágenes de build en Node 24 LTS; jsPDF 4.2.1, axios 1.21, react-router-dom 7.
- Imágenes base fijadas: `python:3.13.18-slim-trixie`, `node:24.22.2-alpine3.24`,
  `nginx:1.30.6-alpine3.24` (rama estable) y `postgres:16.15-alpine3.24`.
- Dependencias de desarrollo separadas en `backend/requirements-dev.txt`; la etapa `dev`
  del Dockerfile las instala para `docker compose exec backend pytest`.

### Corregido

- Calificaciones: ya no se sobrescriben notas con ceros al revisar; la calificación
  masiva no duplica filas; el estado de navegación marca el ítem guardado.
- Equipos: un estudiante no puede repetirse en el mismo equipo ni estar en dos equipos de
  la misma actividad.
- Proyectos: el avance depende de los criterios calificados; no se piden equipos fuera
  del alcance de secciones de la actividad.
- Reportes y PDF: carga del logo con jsPDF, gráficas sin `ResponsiveContainer` y leyenda
  sin cortes.
- Google Drive: renovación del `access_token` con el `refresh_token`.
- Cookie `oauth_state` con el path del callback detrás de `/api` y `Secure` con https.
- Importación CSV de estudiantes (errores 422, tipo de respuesta) y competencias de más
  de 200 caracteres en el catálogo.

[Sin publicar]: https://github.com/gisellopez1020/ABET_eval/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/gisellopez1020/ABET_eval/releases/tag/v1.0.0
