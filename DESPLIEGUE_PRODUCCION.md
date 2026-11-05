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

# Base de datos: OBLIGATORIA. Con SKIP_AUTH=false el backend no arranca con abet_pass,
# PLACEHOLDER o menos de 12 caracteres. Genérala con (sin caracteres que rompan la URL):
#   python -c "import secrets; print(secrets.token_urlsafe(18))"
# Defínela ANTES del primer `up`: el volumen de PostgreSQL guarda la contraseña inicial
# (para cambiarla después, sección 11)
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

# El dominio, con https (no hace falta otro origen: frontend y API comparten dominio).
# En la variante A, docker compose no arranca sin FRONTEND_URL: el healthcheck de nginx
# la usa para verificar el certificado (sección 13)
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
| `SESION_INACTIVIDAD_MINUTOS` | `480` | RNF-16: la sesión vence tras este tiempo sin actividad (sección 12). |
| `SESION_DURACION_MAXIMA_MINUTOS` | `1440` | RNF-16: tope absoluto desde el login; no puede ser menor que el anterior ni pasar de 7 días. |

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
  generando el PDF y el Excel, sin ninguna violación; la prueba se repitió con jsPDF
  4.2.1 (noviembre de 2026), también sin violaciones. Sus dos excepciones son por el
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

**Actualizar a la 1.0.0** (además de lo de la 0012, abajo):

- **Cada docente inicia sesión una vez más**: las sesiones emitidas antes de la 1.0.0
  no traen el tope absoluto de RNF-16 y se rechazan (sección 12).
- Si la base usa la contraseña de ejemplo `abet_pass`, cámbiala **antes** de actualizar
  (sección 11): con `SKIP_AUTH=false` el backend nuevo no arranca con ella.
- Reconstruye las imágenes (`up -d --build`): Python 3.13, usuario sin privilegios.
- `JWT_EXPIRE_MINUTES` se ignora; si la tenías, bórrala (sección 12).

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
# Límite de intentos: de 15 logins seguidos, los primeros ~11 dan 307 y el resto 429
for i in $(seq 1 15); do curl -s -o /dev/null -w "%{http_code} " https://abet.uao.edu.co/api/auth/login; done; echo
```

En el servidor, los tres contenedores deben estar `healthy` (sección 13):

```sh
docker compose --env-file .env.produccion -f docker-compose.prod.yml \
  -f docker-compose.https.yml ps
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
- **Riesgo aceptado: html2canvas 1.4.1.** Captura las gráficas del reporte ABET para el
  PDF. No publica versiones desde enero de 2022, pero no tiene avisos de seguridad
  conocidos (`npm audit`, noviembre de 2026). Se acepta porque solo dibuja nodos del
  propio DOM de la app, en el navegador del docente que exporta: no procesa archivos
  ni HTML de terceros. Es además la razón de la excepción `style-src-elem 'unsafe-inline'`
  de la CSP. La alternativa mantenida, `html2canvas-pro` (misma API), obliga a volver a
  validar el ajuste de la leyenda (`conTextoAlineado`, `frontend/src/pages/Reports/pdf.ts`)
  y la CSP. Revisar si aparece un aviso de seguridad para html2canvas.

## 11. Contraseña de PostgreSQL

Con `SKIP_AUTH=false` el backend **no arranca** si la contraseña de `DATABASE_URL` (la
que docker compose arma con `POSTGRES_PASSWORD`) es `abet_pass`, `PLACEHOLDER`, está
vacía o tiene menos de 12 caracteres. El log dice qué hacer.

**Instalación nueva:** define `POSTGRES_PASSWORD` antes del primer `up`. Genera una sin
caracteres que rompan la URL de conexión (`@`, `/`, `:`):

```sh
python -c "import secrets; print(secrets.token_urlsafe(18))"
```

En Windows, sin Python (PowerShell 5.1 o 7):

```powershell
$b = New-Object byte[] 18; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b).Replace('+','-').Replace('/','_')
```

**Instalación existente:** el volumen de PostgreSQL guarda la contraseña con que se
creó y **no cambia sola** al editar `POSTGRES_PASSWORD`: hay que cambiarla también
dentro de la base. Probado con PostgreSQL 16.15 sobre una base con datos:

```sh
COMPOSE="docker compose --env-file .env.produccion -f docker-compose.prod.yml -f docker-compose.https.yml"

# 1. Respaldo (sección 7). Si el backend está en reinicio por el error, postgres sigue arriba
$COMPOSE up -d postgres

# 2. Cambiar la contraseña dentro de PostgreSQL. Pide la nueva dos veces y no la deja
#    en el historial del shell. No pide la anterior: dentro del contenedor, psql entra
#    por el socket local. Se guarda como SCRAM-SHA-256.
$COMPOSE exec postgres psql -U abet -d abet_eval -c '\password abet'

# 3. Poner la misma en POSTGRES_PASSWORD de .env.produccion. Si además defines
#    DATABASE_URL a mano, cámbiala ahí también (tiene prioridad sobre POSTGRES_PASSWORD).

# 4. Levantar: el backend se recrea con la contraseña nueva
$COMPOSE up -d
$COMPOSE ps          # los tres "healthy"
```

`abet` es el `POSTGRES_USER` por defecto y `abet_eval` el `POSTGRES_DB`. La contraseña
anterior deja de funcionar en cuanto termina el paso 2: haz los pasos 2 a 4 seguidos.
Si te equivocas al escribirla, repite el paso 2.

## 12. Sesión (RNF-16)

La sesión **vence tras 8 horas sin actividad** y **nunca dura más de 24 horas** desde
el login, aunque haya actividad continua. Configurable con `SESION_INACTIVIDAD_MINUTOS`
(480) y `SESION_DURACION_MAXIMA_MINUTOS` (1440); el backend no arranca si el tope es
menor que la inactividad, si alguno es 0 o negativo, o si el tope pasa de 7 días.

Cómo funciona:

- El JWT de la cookie lleva `iat` (cuándo se emitió), `exp` (vencimiento) y `ses_max`
  (el tope, fijado en el login). `exp` es `iat` + la inactividad, sin pasar de `ses_max`.
- Cada petición autenticada **renueva** la cookie si el token tiene al menos 15 minutos:
  `iat` pasa a ser ahora y `exp`, ahora + 8 h (sin pasar del tope). Por eso la sesión
  vence **entre 7 h 45 min y 8 h** después de la última petición. No se renueva en cada
  respuesta: el frontend consulta `/auth/me` a menudo.
- La renovación conserva el token CSRF y el tope. `ses_max` está firmado y se copia tal
  cual: no hay forma de extenderlo.
- Una sesión vencida responde 401 con el mensaje genérico de siempre (el motivo solo va
  al log del backend) y el frontend lleva al login.
- `logout` y `SKIP_AUTH=true` no cambian.

**Al actualizar a la 1.0.0**, las sesiones anteriores no traen `ses_max` y se rechazan:
**cada docente inicia sesión una vez más**. `JWT_EXPIRE_MINUTES` queda obsoleta: se
acepta para que un `.env` antiguo no impida arrancar, pero se ignora con un aviso.

Limitación: el JWT no tiene estado en el servidor. Cerrar sesión borra la cookie, pero
una copia robada sirve hasta su vencimiento (como mucho 8 h sin uso o 24 h en total).

## 13. Contenedores

| Contenedor | Usuario | Healthcheck |
|---|---|---|
| `postgres` | `postgres` (UID 70; la imagen baja de root al arrancar) | `pg_isready` |
| `backend` | `app`, **UID/GID 10001**, sin privilegios. El código es de root y solo de lectura para la app | `GET /health` con Python (la imagen no trae curl), `start_period` de 60 s por las migraciones |
| `frontend` | nginx: proceso maestro root (lee el certificado y abre los puertos 80/443), workers como `nginx` | Local y variante B: `/nginx-salud` por http. Variante A: por **https en el 443, verificando el certificado** (abajo) |

Los tres llevan `security_opt: no-new-privileges:true`: ningún proceso puede ganar
privilegios con un binario setuid. Se comprobó que los tres arrancan así
(`grep NoNewPrivs /proc/1/status` da `1`).

`/nginx-salud` solo responde a la IP `127.0.0.1` de la conexión (desde dentro del
contenedor); desde fuera da 404. Evalúa nginx, no el backend: si el backend cae, nginx
sigue sirviendo la app. El frontend solo espera a que el backend **exista** (no a que
esté sano), para que un backend lento no impida ver la app.

**Healthcheck de la variante A.** `curl` (incluido en la imagen de nginx) se conecta al
443 con el nombre de `FRONTEND_URL` (`--resolve NOMBRE:443:127.0.0.1`) y verifica el
certificado contra `certs/fullchain.pem`, sin desactivar la verificación:

- falla si el nombre no coincide con el certificado o si **el certificado venció**: el
  contenedor queda `unhealthy` (probado: con un certificado vencido, a los 74 s), aunque
  nginx sigue sirviendo;
- sirve igual con el autofirmado de prueba y con uno de una autoridad (probado con una
  cadena raíz → intermedia → servidor: curl acepta como ancla el intermedio del archivo);
- **no** comprueba que el navegador confíe en la autoridad. Eso se vigila desde fuera
  (sección 15).

**La imagen de producción del backend** (`backend/Dockerfile`, etapa `prod`) no lleva
pruebas, pytest, setuptools ni secretos. `.dockerignore` excluye `.env*`, `*.pem`,
`certs/`, `.git` y las pruebas en las dos imágenes. Las pruebas van en la etapa `dev`
(`requirements-dev.txt`), que usa `docker-compose.yml`.

**psycopg2-binary.** El driver de PostgreSQL es la rueda `-binary`, que trae dentro su
propia libpq, OpenSSL y otras bibliotecas de C, no las de Debian: sus parches llegan al
subir la versión de `psycopg2-binary` en `requirements.txt`, no con `apt`. Compilarlo
desde fuente contra la libpq del sistema (`psycopg2`, con una etapa de build con `gcc` y
`libpq-dev`) es una mejora futura.

### Actualizar las imágenes base

Las imágenes tienen **versión fija** (no `latest` ni `16-alpine`), para que una
reconstrucción no cambie de versión sin que nadie lo decida:

| Imagen | Dónde | Etiqueta |
|---|---|---|
| Python | `backend/Dockerfile` | `python:3.13.18-slim-trixie` |
| Node (solo para compilar) | `frontend/Dockerfile`, `frontend/Dockerfile.prod` | `node:24.22.2-alpine3.24` |
| nginx (rama estable) | `frontend/Dockerfile.prod` | `nginx:1.30.6-alpine3.24` |
| PostgreSQL | `docker-compose.yml`, `docker-compose.prod.yml` | `postgres:16.15-alpine3.24` |

Para actualizar (p. ej. cada mes o cuando haya un aviso de seguridad):

1. Busca la etiqueta nueva en Docker Hub. Sube solo el **parche** (3.13.18 → 3.13.19,
   16.15 → 16.16) o la versión de Alpine/Debian; un cambio de versión menor o mayor
   (Python 3.14, Node 26) es un cambio de código que hay que probar.
2. Cámbiala en los archivos de la tabla.
3. Corre las pruebas (README) y reconstruye: `docker compose ... up -d --build --pull always`.
4. Escanea (abajo).

**PostgreSQL: no cambies la versión mayor (16) así.** Pasar a 17 exige volcar la base
con `pg_dump`, crear un volumen nuevo y restaurarla (sección 7); con el volumen de la 16,
la 17 no arranca.

Aunque la etiqueta sea fija, los parches de Alpine del frontend se aplican al construir
(`apk upgrade` en `Dockerfile.prod`): reconstruir trae los nuevos.

**Escaneo de vulnerabilidades** de las imágenes (Trivy, sin instalar nada):

```sh
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image \
  --scanners vuln --severity HIGH,CRITICAL abet-eval-prod-backend
```

Resultado en la 1.0.0 (5 de noviembre de 2026):

- **frontend:** 0 HIGH/CRITICAL (antes del `apk upgrade` había 1 CRITICAL en brotli y 5
  HIGH en curl y expat, con arreglo publicado).
- **backend:** 46 HIGH en paquetes de Debian 13 (util-linux, ncurses, systemd, sqlite,
  perl-base, zlib) **sin arreglo publicado**; la app no usa esos componentes
  directamente (no monta discos, no usa la terminal ni sqlite en producción). Las
  dependencias de Python: sin vulnerabilidades (`pip-audit`). Trivy marca además
  `setuptools 70.3.0`, que es el `pkg_resources` que pip trae dentro
  (`pip/_vendor/vendor.txt`): el módulo vulnerable (`setuptools/package_index.py`,
  CVE-2025-47273) no está en la imagen.
- **postgres:** paquetes de Alpine sin HIGH/CRITICAL; 1 CRITICAL y 25 HIGH en la
  biblioteca estándar de Go del binario `gosu` de la imagen oficial. `gosu` solo se
  ejecuta al arrancar para bajar de root a `postgres` y no abre conexiones. Se corrige
  cuando la imagen oficial lo recompile: actualizar la etiqueta.

## 14. Límite de intentos (nginx)

Los tres archivos de nginx (`nginx.conf`, `nginx-https.conf`,
`nginx-detras-de-proxy.conf.template`) limitan por IP, con respuesta **429**:

| Rutas | Límite |
|---|---|
| `/api/auth/login`, `/api/auth/callback` | 10 por minuto, ráfaga de 10 |
| Subidas: `POST /api/secciones/{id}/estudiantes/csv` y `/vista-previa`, `/api/actividades/{id}/criterios/importar-excel`, `/api/catalogo/ra-abet/importar` | 20 por minuto, ráfaga de 10 |

El resto de la API y los archivos estáticos **no** se limitan. Un login normal son 2
peticiones. Probado en la variante A: 240 peticiones de navegación en ráfaga, 40
guardados, 6 subidas, 20 exportaciones y 20 reportes, sin ningún 429; de 40 logins
seguidos (después de un login normal) pasan 9 y el resto da 429.

- Detrás del proxy (variante B) la clave es la **IP real del docente**: `realip` la toma
  del `X-Forwarded-For` del proxy antes de contar. Probado: el docente que pasa el
  límite recibe 429 y otro docente entra normalmente; agregar IP falsas al inicio de
  `X-Forwarded-For` no lo evita.
- Los intentos rechazados quedan en el log de nginx (`limiting requests ... zone "login"`).
- **En la instalación local** (`http://localhost`) el límite no aplica: el frontend llama
  al backend directamente por el puerto 8000, sin pasar por nginx.
- Si muchos docentes salen por la misma IP (NAT), comparten el cupo: unos 30 logins en
  un minuto siguen funcionando. Si no alcanza, sube `rate` y `burst` en la zona `login`.

## 15. Monitoreo (RNF-17)

Con lo que ya trae la app, TI puede **medir** la disponibilidad (no garantizarla: es un
solo servidor con un solo PostgreSQL):

- **Chequeo externo cada minuto** (Uptime Kuma, Zabbix o el monitor de TI) contra
  `https://DOMINIO/` (nginx) y `https://DOMINIO/api/health` (backend), con alerta tras
  2 o 3 fallos seguidos. Es la medida de RNF-17: 98 % equivale a unas 14,6 horas de
  caída al mes.
- **Estado de los contenedores:** `docker compose ... ps` (deben estar `healthy`) o
  `docker events --filter event=health_status`.
- **Reinicios:** `restart: unless-stopped` levanta solo un contenedor que cae; un número
  de reinicios que sube (`docker inspect -f '{{.RestartCount}}' <contenedor>`) indica un
  problema aunque la app responda.
- **Vencimiento del certificado** (variante A): alerta 30 días antes. El healthcheck lo
  detecta, pero solo cuando ya venció.
- **Disco** del volumen de PostgreSQL y de los respaldos, y que el respaldo diario exista.
