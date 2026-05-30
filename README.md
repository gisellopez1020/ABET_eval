# ABET Eval

Sistema de evaluación por criterios ABET para la Universidad Autónoma de Occidente (UAO), Cali, Colombia.

## Instalación en 5 pasos

### Requisitos previos
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y en ejecución
- Git

### 1. Clonar el repositorio y configurar variables de entorno

```bash
git clone https://github.com/gisellopez1020/ABET_eval.git
cd abet-eval
cp .env.example .env
```

Edita `.env` si necesitas cambiar contraseñas. Para desarrollo local, los valores por defecto funcionan sin modificación.

### 2. Levantar los servicios

```bash
docker-compose up -d
```

Espera ~30 segundos a que PostgreSQL esté listo. Puedes verificar con:
```bash
docker-compose logs postgres
```

### 3. Ejecutar migraciones de base de datos

```bash
docker-compose exec backend alembic upgrade head
```

### 4. Cargar datos de ejemplo

```bash
docker-compose exec backend python scripts/seed.py
```

### 5. Abrir la aplicación

- **Frontend:** http://localhost:5173
- **API Swagger:** http://localhost:8000/docs

Con `SKIP_AUTH=true` (valor por defecto en `.env`), el botón "Iniciar sesión con Microsoft" hace login directo sin credenciales reales.

---

## Credenciales de desarrollo

| Campo | Valor |
|-------|-------|
| Usuario mock | `profesor.test@uao.edu.co` |
| `SKIP_AUTH` | `true` |
| BD host | `localhost:5432` |
| BD nombre | `abet_eval` |
| BD usuario | `abet` |
| BD contraseña | `abet_pass` |

---

## Integración Microsoft (producción)

Ver [SETUP_MICROSOFT.md](./SETUP_MICROSOFT.md) para configurar Azure AD con credenciales reales del tenant UAO.

---

## Estructura del proyecto

```
abet-eval/
├── docker-compose.yml
├── .env.example
├── backend/           # FastAPI + Python 3.11
│   ├── app/models/    # Modelos SQLAlchemy
│   ├── app/routers/   # Endpoints por módulo
│   ├── alembic/       # Migraciones de BD
│   └── scripts/       # seed.py y utilidades
└── frontend/          # React 18 + TypeScript + Vite
    └── src/
        ├── pages/     # Una carpeta por pantalla
        └── components/
```
