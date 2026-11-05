"""
Endurecimiento de la 1.0.0 en los archivos de despliegue (no en el código de la app):
límite de intentos en los tres nginx, contenedores sin privilegios y con healthcheck,
imágenes con versión fija, pruebas fuera de la imagen de producción.

Las pruebas de verdad (ráfagas de curl, contenedores levantados) están en
DESPLIEGUE_PRODUCCION.md; estas evitan que alguien lo deshaga sin darse cuenta.
"""
import os
import re
from pathlib import Path

import pytest

RAIZ = Path(os.environ.get("ABET_RAIZ_REPO") or Path(__file__).resolve().parents[2])
BACKEND = Path(__file__).resolve().parents[1]
NGINX = ["nginx.conf", "nginx-https.conf", "nginx-detras-de-proxy.conf.template"]


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


@pytest.mark.parametrize("archivo", NGINX)
class TestNginx:
    def test_zonas_de_login_y_subidas_con_429(self, archivo):
        conf = leer(RAIZ / "frontend" / archivo)
        assert "limit_req_zone $limite_login   zone=login:10m   rate=10r/m;" in conf
        assert "limit_req_zone $limite_subidas zone=subidas:10m rate=20r/m;" in conf
        assert "limit_req_status 429;" in conf
        # La clave es la IP del cliente (tras realip, en la variante del proxy)
        assert conf.count("$binary_remote_addr;") == 2

    def test_las_rutas_limitadas(self, archivo):
        conf = leer(RAIZ / "frontend" / archivo)
        assert "~^/api/auth/(login|callback)$" in conf
        for ruta in ("secciones/[^/]+/estudiantes/(csv|vista-previa)",
                     "actividades/[^/]+/criterios/importar-excel", "catalogo/ra-abet/importar"):
            assert ruta in conf

    def test_se_aplican_en_la_api(self, archivo):
        bloque = leer(RAIZ / "frontend" / archivo).split("location /api/ {", 1)[1].split("}", 1)[0]
        assert "limit_req zone=login   burst=10 nodelay;" in bloque
        assert "limit_req zone=subidas burst=10 nodelay;" in bloque

    def test_salud_solo_desde_el_propio_contenedor(self, archivo):
        conf = leer(RAIZ / "frontend" / archivo)
        bloque = conf.split("location = /nginx-salud {", 1)[1].split("\n    }", 1)[0]
        assert 'if ($realip_remote_addr != "127.0.0.1")' in bloque
        assert "return 404;" in bloque


def test_detras_del_proxy_el_healthcheck_pasa_el_control_de_acceso():
    conf = leer(RAIZ / "frontend" / "nginx-detras-de-proxy.conf.template")
    # Hasta la "}" sola en su línea (no la de ${PROXY_CONFIANZA})
    geo = conf.split("geo $realip_remote_addr $desde_proxy_de_confianza {", 1)[1].split("\n}", 1)[0]
    assert "127.0.0.1 1;" in geo


class TestCompose:
    def test_produccion_sin_privilegios_y_con_healthchecks(self):
        prod = leer(RAIZ / "docker-compose.prod.yml")
        assert prod.count("- no-new-privileges:true") == 3
        assert prod.count("healthcheck:") == 3
        assert "target: prod" in prod
        assert "SESION_INACTIVIDAD_MINUTOS: ${SESION_INACTIVIDAD_MINUTOS:-480}" in prod
        assert "SESION_DURACION_MAXIMA_MINUTOS: ${SESION_DURACION_MAXIMA_MINUTOS:-1440}" in prod

    def test_https_verifica_el_certificado_en_el_443(self):
        https = leer(RAIZ / "docker-compose.https.yml")
        assert "--cacert /etc/nginx/certs/fullchain.pem" in https
        assert '--resolve "$$h:443:127.0.0.1"' in https
        for inseguro in ("-k ", "--insecure", "--no-check-certificate"):
            assert inseguro not in https

    def test_desarrollo_con_pruebas(self):
        dev = leer(RAIZ / "docker-compose.yml")
        assert "target: dev" in dev
        assert "- ./:/repo:ro" in dev
        assert "ABET_RAIZ_REPO: /repo" in dev

    @pytest.mark.parametrize("archivo", ["docker-compose.yml", "docker-compose.prod.yml"])
    def test_postgres_con_version_fija_y_mayor_16(self, archivo):
        assert re.search(r"image: postgres:16\.\d+-alpine3\.\d+\n", leer(RAIZ / archivo))


class TestImagenes:
    @pytest.mark.parametrize("dockerfile", ["backend/Dockerfile", "frontend/Dockerfile", "frontend/Dockerfile.prod"])
    def test_imagenes_base_con_version_fija(self, dockerfile):
        for imagen in re.findall(r"^FROM (\S+)", leer(RAIZ / dockerfile), re.M):
            if imagen in ("base",):  # etapa propia
                continue
            # nombre:X.Y.Z-variante (no "3.13-slim", "alpine" ni "latest")
            assert re.fullmatch(r"[a-z]+:\d+\.\d+\.\d+-[a-z]+\d*(\.\d+)?(-[a-z]+)?", imagen), imagen

    def test_backend_prod_sin_privilegios_y_es_la_ultima_etapa(self):
        dockerfile = leer(BACKEND / "Dockerfile")
        etapas = re.findall(r"^FROM \S+ AS (\w+)", dockerfile, re.M)
        assert etapas == ["base", "dev", "prod"]
        prod = dockerfile.split("AS prod", 1)[1]
        assert "USER 10001:10001" in prod
        assert "requirements-dev" not in prod

    def test_pytest_no_va_en_produccion(self):
        produccion = leer(BACKEND / "requirements.txt").lower()
        for paquete in ("pytest", "httpx2"):
            assert not re.search(rf"^{paquete}\b", produccion, re.M)
        dev = leer(BACKEND / "requirements-dev.txt")
        assert dev.startswith("#") and "-r requirements.txt" in dev and "pytest==" in dev

    @pytest.mark.parametrize("ignore", ["backend/.dockerignore", "frontend/.dockerignore"])
    def test_dockerignore_excluye_secretos_y_pruebas(self, ignore):
        lineas = set(leer(RAIZ / ignore).splitlines())
        assert {".git", ".env", ".env.*", "*.pem", "certs/", "tests/"} <= lineas
