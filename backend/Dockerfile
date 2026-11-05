# Backend (FastAPI). Tres etapas:
#   base  dependencias de producción (requirements.txt)
#   dev   + requirements-dev.txt (pytest). La usa docker-compose.yml (target: dev), que
#         monta ./backend encima de /app: las pruebas vienen de ese montaje.
#   prod  la imagen que se despliega (docker-compose.prod.yml). Es la última etapa, así
#         que es la que construye un `docker build` sin --target. Sin pruebas ni pytest,
#         y la app corre con un usuario sin privilegios.
#
# Versión fija de la imagen base (no "3.13-slim"): actualizarla es un cambio explícito.
# Cómo: DESPLIEGUE_PRODUCCION.md, "Actualizar las imágenes base".
FROM python:3.13.18-slim-trixie AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_ROOT_USER_ACTION=ignore

WORKDIR /app

# pip al día antes de instalar (la imagen base puede traer uno con avisos de seguridad).
# setuptools y wheel no hacen falta: todas las dependencias se instalan como ruedas, y
# desde Python 3.12 la imagen ya no los trae.
COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install -r requirements.txt \
    && pip uninstall -y setuptools wheel

EXPOSE 8000

# Salud: el endpoint /health con Python (la imagen slim no trae curl ni wget)
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"]


FROM base AS dev

COPY requirements-dev.txt .
RUN pip install -r requirements-dev.txt

COPY . .

# Como root: en desarrollo ./backend se monta encima de /app y pytest escribe ahí
# (.pytest_cache, htmlcov); con otro UID fallaría en Linux.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]


FROM base AS prod

# Usuario sin privilegios con UID/GID fijos (10001: fuera del rango de usuarios del
# host, así no coincide con nadie). El código queda de root y solo de lectura para la
# app: si alguien lograra ejecutar código en ella, no podría modificarlo.
RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --no-create-home --home-dir /nonexistent \
       --shell /usr/sbin/nologin app

COPY . .

USER 10001:10001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
