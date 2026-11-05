# Despliegue en producción

Guía para el equipo de TI que instala ABET Eval en un servidor de la universidad.
Para la instalación local de un profesor (http://localhost) ver el [README](./README.md);
para crear las credenciales de Google y las claves, [SETUP_GOOGLE.md](./SETUP_GOOGLE.md).

ABET Eval son tres contenedores: `postgres` (base de datos), `backend` (API en
FastAPI) y `frontend` (nginx con la app compilada, que además reenvía `/api/` al
backend). En producción **toda la comunicación entre el navegador y la app va por
HTTPS con TLS 1.2 o 1.3** (RNF-13), y los datos personales de los estudiantes se
guardan cifrados en la base (RNF-14, sección 6). Para HTTPS hay dos formas:

| | Variante A: TLS en la app | Variante B: TLS en el proxy de la universidad |
|---|---|---|
| Quién termina HTTPS | el nginx de la app | el proxy inverso de la universidad |
| Archivo | `docker-compose.https.yml` | `docker-compose.detras-de-proxy.yml` |
| Certificado | lo monta TI en `./certs/` | lo tiene el proxy |
| Puertos publicados | 80 (solo redirige) y 443 | `PUERTO_PROXY` (8080), solo para el proxy |

En las dos variantes **el backend no se publica**: solo nginx llega a él, por una red
interna de Docker. Ambos archivos se aplican encima de `docker-compose.prod.yml`, que
no cambia (el profesor lo sigue usando en local por http).

---

## 1. Requisitos

- **Servidor** Linux con Docker Engine y **Docker Compose 2.24.4 o superior**
  (`docker compose version`): los archivos usan `!reset` y `!override`.
- **Dominio** con registro DNS hacia el servidor (o hacia el proxy, en la variante B).
  En esta guía, `abet.uao.edu.co` es un ejemplo.
- **Certificado TLS** del dominio emitido por la universidad o una autoridad pública
  (variante A). El certificado autofirmado de `scripts/` **no sirve para producción**.
- **Google Cloud Console** (ver [SETUP_GOOGLE.md](./SETUP_GOOGLE.md), paso 3):
  registrar como URI de redirección autorizada exactamente
  `https://abet.uao.edu.co/api/auth/callback`. Con `/api/`: el login entra por nginx.
- **Puertos**: variante A, 80 y 443 abiertos hacia internet o la red de la
  universidad. Variante B, `PUERTO_PROXY` abierto solo para el proxy. El 8000
  (backend) y el 5432 (base de datos) **no** se abren.
- **Disco cifrado** (LUKS, BitLocker o el del proveedor) donde vivan el volumen de la
  base de datos y los respaldos: sin él, las calificaciones quedan en claro en el
  disco (sección 6).
- Un **lugar seguro fuera del servidor** para `DATA_ENCRYPTION_KEY` y la frase de los
  respaldos.

## 2. Variables de entorno

Usa un archivo propio del servidor, por ejemplo `.env.produccion` (ignorado por git;
**nunca lo subas al repositorio**), y pásalo con `--env-file`. Así no se mezcla con el
`.env` de desarrollo.

```env
# Login real: obligatorio en producción
SKIP_AUTH=false

# Base de datos: cambia la contraseña por defecto
POSTGRES_PASSWORD=<contraseña larga y aleatoria>

# Google OAuth (SETUP_GOOGLE.md, pasos 1 a 3)
GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<secreto>
GOOGLE_REDIRECT_URI=https://abet.uao.edu.co/api/auth/callback

# Claves (SETUP_GOOGLE.md, pasos 4 y 5), las tres distintas
JWT_SECRET_KEY=<clave>
TOKEN_ENCRYPTION_KEY=<clave Fernet>
# Cifra los datos de los estudiantes. SI SE PIERDE, ESOS DATOS NO SE RECUPERAN (sección 6)
DATA_ENCRYPTION_KEY=<otra clave Fernet>

# El dominio, con https (no hace falta otro origen: frontend y API comparten dominio)
FRONTEND_URL=https://abet.uao.edu.co
FRONTEND_ORIGINS=https://abet.uao.edu.co

# Opcional: Gemini para la retroalimentación redactada
GEMINI_API_KEY=PLACEHOLDER
```

`VITE_API_URL` **no** hace falta: los dos archivos lo fijan en `/api`.

Con `SKIP_AUTH=false`, **el backend no arranca** si `GOOGLE_REDIRECT_URI`,
`FRONTEND_URL` o algún origen de `FRONTEND_ORIGINS` usa `http://` con un host que no
sea esta máquina (`localhost`, `127.0.0.1`, `::1` o el servicio `frontend` de
compose). Por http viajarían en claro el código de autorización de Google y la cookie
de sesión.

Variables opcionales de los dos archivos:

| Variable | Por defecto | Para qué |
|---|---|---|
| `RED_INTERNA_SUBNET` | `172.30.80.0/24` | Red interna de Docker. Cámbiala si choca con una red de la universidad. |
| `NGINX_IP` | `172.30.80.10` | IP fija de nginx en esa red: la única de la que el backend acepta `X-Forwarded-For`/`-Proto`. Debe estar dentro de `RED_INTERNA_SUBNET`. |
| `PUERTO_HTTP` / `PUERTO_HTTPS` | `80` / `443` | Variante A. |
| `PUERTO_PROXY` | `8080` | Variante B. |
| `PROXY_CONFIANZA` | (obligatoria en B) | IP o red CIDR del proxy de la universidad. |

## 3. Variante A: TLS en la app

1. Copia el certificado y su llave a `certs/` en la raíz del proyecto (la carpeta está
   en `.gitignore`):
   - `certs/fullchain.pem`: el certificado del dominio **seguido de los intermedios**
     de la autoridad (en ese orden, en un solo archivo).
   - `certs/privkey.pem`: la llave privada, sin contraseña. Permisos restringidos
     (`chmod 600`, dueño root).
2. Levanta:

   ```sh
   docker compose --env-file .env.produccion \
     -f docker-compose.prod.yml -f docker-compose.https.yml up -d --build
   ```

3. Verifica (sección 8).

Qué configura `frontend/nginx-https.conf`:

- Solo **TLS 1.2 y TLS 1.3**; SSL, TLS 1.0 y 1.1 se rechazan en el saludo. En TLS
  1.2, solo intercambio ECDHE y cifrados AEAD (AES-GCM, ChaCha20-Poly1305), como el
  perfil *intermediate* de Mozilla.
- El puerto 80 solo responde `301` hacia `https://`.
- Cabeceras (`frontend/nginx-cabeceras-seguridad.conf`): `Strict-Transport-Security`
  (HSTS, un año, sin `includeSubDomains`), `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` y una `Content-Security-Policy` que solo permite recursos del
  propio dominio. Esa CSP se probó recorriendo todas las pantallas en Chrome, y
  generando el PDF y el Excel, sin ninguna violación. Sus dos excepciones son por el
  PDF del reporte: elementos `<style>` en línea (html2canvas) e imágenes `data:` (jsPDF).
- `/api/` se reenvía al backend con `X-Forwarded-For` (la IP de la conexión) y
  `X-Forwarded-Proto: https`.

> **HSTS:** tras la primera visita, el navegador solo usará https con ese dominio
> durante un año. No lo actives en un dominio que vaya a volver a http.

**Renovar el certificado:** reemplaza los dos archivos de `certs/` y recarga nginx
sin cortar el servicio:

```sh
docker compose --env-file .env.produccion -f docker-compose.prod.yml \
  -f docker-compose.https.yml exec frontend nginx -s reload
```

## 4. Variante B: TLS en el proxy de la universidad

El proxy de la universidad termina HTTPS y reenvía por http a este servidor, en
`PUERTO_PROXY`. El nginx de la app **solo acepta conexiones cuya IP de origen sea
`PROXY_CONFIANZA`** (a cualquier otra le responde 403) y toma la IP real del docente
del `X-Forwarded-For` que pone el proxy.

```sh
docker compose --env-file .env.produccion \
  -f docker-compose.prod.yml -f docker-compose.detras-de-proxy.yml up -d --build
```

con `PROXY_CONFIANZA=<IP o red del proxy>` en `.env.produccion`.

Lo que debe hacer el proxy (es responsabilidad de TI, la app no lo puede garantizar):

- Servir `https://abet.uao.edu.co` solo con **TLS 1.2 o superior** y un certificado válido.
- Redirigir http a https y enviar **HSTS** (nginx de la app también la envía y el
  proxy puede reenviarla tal cual).
- Reenviar **todas** las rutas (`/`, `/assets/`, `/api/...`) a
  `http://<servidor>:<PUERTO_PROXY>`, con `X-Forwarded-For` y aceptando cuerpos de al
  menos 3 MB (subida de listas y rúbricas).
- Ir por una red de confianza hasta el servidor: entre el proxy y la app el tráfico
  va sin cifrar.

**Comprueba que la IP que ve nginx es la del proxy.** En Linux, Docker conserva la
IP de origen de las conexiones externas. Si nginx respondiera 403 a todo, revisa la
IP con `docker compose ... logs frontend` y ajusta `PROXY_CONFIANZA`.

## 5. Qué se cifra en tránsito y qué no

| Tramo | Cifrado | Dónde se configura |
|---|---|---|
| Navegador ↔ app | TLS 1.2/1.3 | Variante A: nginx de la app. Variante B: proxy de la universidad. |
| Proxy ↔ app (solo variante B) | **No** (http en la red de la universidad) | Red de confianza de TI |
| nginx ↔ backend, backend ↔ PostgreSQL | **No**: red interna de Docker, sin salir del servidor | `docker-compose.*.yml` |
| Backend ↔ Google (OAuth, Drive, Gemini) | HTTPS con verificación del certificado | Código: `tests/test_tls_salientes.py` falla si aparece una URL `http://` o se desactiva la verificación |

**PostgreSQL con SSL.** La base no se publica y solo el backend llega a ella, por la
red interna del mismo servidor, así que no se exige SSL. Si la base pasa a **otro
servidor**, sí hay que activarlo: configura SSL en PostgreSQL (certificado y
`ssl=on`) y agrega `?sslmode=require` (o `verify-full`) al final de `DATABASE_URL`.
No hace falta cambiar código.

## 6. Cifrado en reposo (RNF-14)

> ### ⚠️ Si se pierde `DATA_ENCRYPTION_KEY`, los datos de los estudiantes no se pueden recuperar
>
> El nombre, el código y el correo de cada estudiante se guardan cifrados con
> `DATA_ENCRYPTION_KEY`. **Sin esa clave exacta no hay forma de leerlos**, ni desde la
> base ni desde un respaldo, y nadie (tampoco el equipo que hizo la app) puede
> recuperarlos.
>
> - Guarda una copia de la clave **fuera del servidor**, en el gestor de contraseñas o
>   la bóveda de secretos de la universidad, con al menos dos personas con acceso.
> - **No la cambies.** La app no rota la clave: con una clave nueva, el backend no
>   arranca porque no puede leer los datos ya cifrados.
> - Un respaldo solo sirve junto con la clave con que se hizo. Guárdalos por separado:
>   el respaldo en un lugar y la clave en otro.

**Qué cifra la app.** En la tabla `estudiantes`: `nombre_completo`, `codigo_estudiante`
y `email`. Se cifran con Fernet (AES-128-CBC más HMAC-SHA256 para detectar
alteraciones), con una subclave que se deriva de `DATA_ENCRYPTION_KEY` con
HKDF-SHA256. Cada valor se guarda como `enc:v1:<texto cifrado>` y tiene su propio
vector aleatorio, así que dos estudiantes con el mismo nombre no se pueden reconocer
en la base. Quien lea la base o un respaldo sin la clave ve solo texto cifrado.

**Qué NO cifra la app.** Queda en claro en PostgreSQL:

- Las **calificaciones**: valores de los criterios y notas calculadas. Se usan en las
  sumas y promedios de los reportes y tienen restricciones en la base.
- Nombres de asignaturas, secciones, actividades, rúbricas y equipos; la
  retroalimentación guardada; el correo de los docentes.
- La relación entre cada calificación y el `id` interno del estudiante (sin la clave no
  se sabe de quién es, pero sí cuántas notas tiene cada id).

Fuera de la base:

- En memoria del backend mientras atiende una petición.
- En lo que se descarga: Excel y PDF en el computador del docente.
- En el **Excel de detalle**, que se sube al Google Drive del docente con nombres y
  códigos (por HTTPS, a su cuenta institucional).

Gemini **no** recibe nombres, códigos ni correos de los estudiantes; solo los textos de
la rúbrica.

**Cifrado del disco: requisito de TI, no lo garantiza la app.** Las calificaciones y el
resto de los datos de la lista anterior solo quedan protegidos en reposo si TI cifra:

- el disco o volumen donde Docker guarda el volumen `abet-eval-prod_postgres_data`
  (por defecto en `/var/lib/docker/volumes/`): LUKS/dm-crypt en Linux, BitLocker en
  Windows, o el cifrado de disco del proveedor si es una máquina virtual;
- el disco o el almacenamiento donde se guardan los respaldos (sección 7), además del
  cifrado propio de cada respaldo.

La app no puede comprobar que eso esté hecho.

**Cómo arranca.** En cada arranque, después de las migraciones, el backend ejecuta
`python -m app.verificar_cifrado`:

- Si hay datos cifrados y `DATA_ENCRYPTION_KEY` falta o no es la clave con que se
  cifraron, **el backend no arranca** y el log lo dice. Nunca muestra datos
  ilegibles ni un error 500. Si con el backend ya en marcha apareciera un dato que no
  se puede descifrar (p. ej., se restauró debajo una base de otra instalación), las
  pantallas con estudiantes responden 503 con ese mismo mensaje.
- Si encuentra valores en claro (por ejemplo, una instalación que empezó sin clave),
  los cifra.
- Nunca escribe en el log nombres, códigos, correos ni claves; solo cantidades.

Con `SKIP_AUTH=false` la clave es obligatoria. Con `SKIP_AUTH=true` (solo la
instalación local de un profesor) es opcional: sin ella los datos se guardan **sin
cifrar** y el arranque lo avisa.

**Limitación:** como cada valor se cifra con un vector aleatorio, la base no puede
buscar, filtrar ni ordenar por nombre, código o correo. La app ordena los nombres en
Python, en orden alfabético español: sin distinguir tildes ni mayúsculas, y con la Ñ
entre la N y la O. La app no tiene hoy búsquedas ni detección de duplicados en la base
por esos campos.

## 7. Respaldos y actualizaciones

**Haz un respaldo antes de cada actualización.** Las migraciones corren solas al
arrancar. La que introduce el cifrado (0012) cifra todos los estudiantes existentes
en una sola transacción: si algo falla, la base queda como estaba. Aun así, respalda
antes. Antes de actualizar a esta versión:

1. Genera `DATA_ENCRYPTION_KEY` (ver [SETUP_GOOGLE.md](./SETUP_GOOGLE.md), paso 5),
   guárdala fuera del servidor y agrégala a `.env.produccion`.
2. Haz el respaldo (abajo).
3. Actualiza y arranca. Con `SKIP_AUTH=false` y sin la clave, la migración **no corre**
   y el backend no arranca: la base queda intacta en la versión anterior.

**Crear un respaldo cifrado.** `pg_dump` guarda los datos del estudiante tal como están
en la base, es decir cifrados, pero **las calificaciones y lo demás van en claro**.
Cualquiera con el archivo puede leerlos con `pg_restore`, sin ninguna clave. Por eso
el respaldo también se cifra, con una frase propia (no con `DATA_ENCRYPTION_KEY`).
Probado con GnuPG 2.4:

```sh
# Una sola vez: frase del respaldo, guardada fuera del servidor
openssl rand -base64 32 > /root/frase-respaldo && chmod 600 /root/frase-respaldo

COMPOSE="docker compose --env-file .env.produccion -f docker-compose.prod.yml -f docker-compose.https.yml"
$COMPOSE exec -T postgres pg_dump -U abet -d abet_eval -Fc \
  | gpg --batch --pinentry-mode loopback --passphrase-file /root/frase-respaldo \
        --symmetric --cipher-algo AES256 -o "abet-$(date +%F).dump.gpg"
```

Con [age](https://age-encryption.org) sería `... | age -p -o abet-$(date +%F).dump.age`
(o `age -r <clave pública>` para no guardar ninguna frase en el servidor). No se probó
en este proyecto.

**Restaurar** (en una base vacía; si es otro servidor, con la misma `DATA_ENCRYPTION_KEY`):

```sh
$COMPOSE up -d postgres
gpg --batch --pinentry-mode loopback --passphrase-file /root/frase-respaldo \
    --decrypt abet-AAAA-MM-DD.dump.gpg \
  | $COMPOSE exec -T postgres pg_restore -U abet -d abet_eval --no-owner
$COMPOSE up -d
```

Sin la `DATA_ENCRYPTION_KEY` con que se hizo el respaldo, el backend no arranca sobre
la base restaurada y dice por qué. **Prueba la restauración** de vez en cuando en una
máquina aparte: un respaldo que nunca se restauró no está comprobado.

**Volver a la versión anterior a la 0012** (descifra los datos y exige la clave):
`$COMPOSE run --rm backend alembic downgrade 0011`.

## 8. Verificación

Con la variante A en marcha, desde otra máquina (cambia el dominio):

```sh
# TLS 1.0 y 1.1 rechazados por el servidor (alerta "protocol version").
# -cipher DEFAULT@SECLEVEL=0 hace que el cliente sí lo intente.
echo | openssl s_client -connect abet.uao.edu.co:443 -tls1_1 -cipher 'DEFAULT@SECLEVEL=0'
# TLS 1.2 y 1.3 aceptados
echo | openssl s_client -connect abet.uao.edu.co:443 -tls1_2
echo | openssl s_client -connect abet.uao.edu.co:443 -tls1_3
# http redirige a https
curl -I http://abet.uao.edu.co/
# HSTS y demás cabeceras
curl -I https://abet.uao.edu.co/
# Cookie del login: Secure, HttpOnly, Path=/api/auth
curl -s -o /dev/null -D - https://abet.uao.edu.co/api/auth/login | grep -i set-cookie
# El backend no está publicado: debe fallar la conexión
curl -m 5 http://abet.uao.edu.co:8000/health
```

Después, inicia sesión con una cuenta institucional y en las herramientas del
navegador comprueba que la cookie `session` tiene `Secure` y `HttpOnly`.

## 9. Probar sin certificado real (solo pruebas)

`scripts/generar-cert-prueba.ps1` (Windows) o `scripts/generar-cert-prueba.sh`
(Linux) crean en `certs/` un certificado **autofirmado, válido 30 días, solo para
pruebas en localhost**. El navegador mostrará una advertencia. **No es apto para
producción.** Para probar en la propia máquina:

```env
GOOGLE_REDIRECT_URI=https://localhost/api/auth/callback
FRONTEND_URL=https://localhost
FRONTEND_ORIGINS=https://localhost
```

y registra esa URI en Google Cloud si quieres completar el login.

## 10. Notas

- **Swagger (`/docs`)** queda desactivado en las dos variantes (`API_DOCS=false`):
  detrás del prefijo `/api` no carga. En la instalación local sigue en
  `http://localhost:8000/docs`.
- Los dos archivos usan el mismo proyecto que `docker-compose.prod.yml`
  (`abet-eval-prod`), así que se conservan la base de datos y sus datos al pasar de
  una variante a otra. Para cambiar de variante, primero `down` con el archivo
  anterior. **No uses `down -v`: borra la base de datos.**
- Si el backend no arranca, `docker compose ... logs backend` muestra el motivo
  (variable con http, clave faltante o inválida).
