# Configuración de Google OAuth 2.0 y Google Drive

Esta guía explica cómo configurar el login real con Google (Authorization Code
flow) y la sincronización con Google Drive para el backend de ABET Eval.
Con `SKIP_AUTH=true` (el valor de `.env.example` y `docker-compose.yml`) no es necesario
nada de esto, ya que la app usa un usuario simulado y no llama a Google. Ese modo es solo
para desarrollo local: cualquiera con acceso a la API entraría como ese usuario, así que
**el backend no arranca** con `SKIP_AUTH=true` si `GOOGLE_REDIRECT_URI`, `FRONTEND_URL` o
algún origen de `FRONTEND_ORIGINS` apunta a un dominio real (cuentan como locales
`localhost`, `127.0.0.1`, `::1`, `*.localhost` y los nombres sin punto, como `frontend`).

## 1. Crear un proyecto en Google Cloud Console

1. Entra a [Google Cloud Console](https://console.cloud.google.com/).
2. Crea un proyecto nuevo (o usa uno existente).
3. En **APIs y servicios → Biblioteca**, habilita **Google Drive API**.

## 2. Configurar la pantalla de consentimiento OAuth

1. Ve a **APIs y servicios → Pantalla de consentimiento de OAuth**.
2. Tipo de usuario: **Interno** (si usa Google Workspace de la UAO) o
   **Externo** (para pruebas con cualquier cuenta de Google).
3. Agrega los scopes:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/drive.file`

## 3. Crear credenciales OAuth 2.0

1. Ve a **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**.
2. Tipo de aplicación: **Aplicación web**.
3. En **URIs de redirección autorizados**, agrega la URL del callback del backend:
   - Desarrollo: `http://localhost:8000/auth/callback`
   - Producción: `https://<tu-dominio>/api/auth/callback` (mismo host que el
     frontend; ver la nota del paso 7)
4. Guarda el **Client ID** y el **Client Secret** generados.

## 4. Generar `JWT_SECRET_KEY` (obligatorio con `SKIP_AUTH=false`)

El backend firma su propio JWT de sesión con `JWT_SECRET_KEY`. El valor por
defecto (`PLACEHOLDER`) es público: con él cualquiera podría forjar un JWT
válido y hacerse pasar por cualquier docente sin pasar por Google. Por eso,
con `SKIP_AUTH=false`, **el backend no arranca** si `JWT_SECRET_KEY` falta, vale
`PLACEHOLDER`, está vacía o tiene menos de 32 caracteres.

Genera una clave aleatoria:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Guárdala para el paso 6. No la subas al repositorio y usa una distinta
en cada entorno (desarrollo, producción).

## 5. Generar `TOKEN_ENCRYPTION_KEY` y `DATA_ENCRYPTION_KEY` (obligatorias con `SKIP_AUTH=false`)

El backend guarda en la base de datos el `refresh_token` de Google Drive de cada
docente, cifrado con `TOKEN_ENCRYPTION_KEY`, para que la sincronización con Drive
siga funcionando después de reiniciar el backend o el computador. Con
`SKIP_AUTH=false`, **el backend no arranca** si `TOKEN_ENCRYPTION_KEY` falta, vale
`PLACEHOLDER`, está vacía o no es una clave Fernet válida (base64 *urlsafe* de 32
bytes: 44 caracteres).

Genera la clave con **PowerShell** (no necesita Python; sirve en Windows PowerShell
5.1 y en PowerShell 7):

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b).Replace('+','-').Replace('/','_')
```

O con Python, si lo tienes instalado:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Guárdala para el paso 6, con el mismo cuidado que `JWT_SECRET_KEY`. Si la clave
cambia o se pierde, los accesos guardados ya no se pueden descifrar: no es un
error, pero cada docente tendrá que volver a iniciar sesión con Google para que
Drive funcione. Por lo mismo, un respaldo de la base restaurado en otro computador
necesita la misma clave (o que los docentes vuelvan a iniciar sesión).

### `DATA_ENCRYPTION_KEY` (también obligatoria con `SKIP_AUTH=false`)

Con el mismo comando genera **otra** clave, distinta de la anterior y de
`JWT_SECRET_KEY`: con ella se cifran en la base de datos el nombre, el código y el
correo de cada estudiante (RNF-14). Con `SKIP_AUTH=false` el backend no arranca sin
ella, ni si es igual a alguna de las otras dos.

> **Esta clave no se puede perder.** A diferencia de `TOKEN_ENCRYPTION_KEY`, si
> `DATA_ENCRYPTION_KEY` cambia o se pierde, **los datos de los estudiantes no se
> pueden recuperar**, ni siquiera desde un respaldo. Guarda una copia fuera del
> computador (por ejemplo, en el gestor de contraseñas de la universidad). Detalles,
> respaldos y qué queda cifrado: [DESPLIEGUE_PRODUCCION.md](./DESPLIEGUE_PRODUCCION.md#6-cifrado-en-reposo-rnf-14).

## 6. Variables de entorno del backend

Copia estos valores al archivo `.env`:

```bash
GOOGLE_CLIENT_ID=<client-id-de-google>
GOOGLE_CLIENT_SECRET=<client-secret-de-google>
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/callback

# Clave generada en el paso 4 (mínimo 32 caracteres)
JWT_SECRET_KEY=<clave-generada-en-el-paso-4>

# Claves generadas en el paso 5 (claves Fernet de 44 caracteres, distintas entre sí)
TOKEN_ENCRYPTION_KEY=<clave-generada-en-el-paso-5>
DATA_ENCRYPTION_KEY=<otra-clave-generada-en-el-paso-5>

# URL del frontend a la que se redirige tras un login exitoso
FRONTEND_URL=http://localhost:5173

# Orígenes que CORS acepta, separados por comas. No se permite "*": la sesión
# viaja en una cookie y con "*" cualquier sitio podría usarla.
FRONTEND_ORIGINS=http://localhost:5173

GOOGLE_DRIVE_FOLDER_NAME=ABET_Eval

# Obligatorio en un despliegue: con true y URLs de un dominio real el backend no arranca
SKIP_AUTH=false
```

Si al arrancar el backend falla con un error sobre `JWT_SECRET_KEY`, vuelve al
paso 4: la clave no está configurada o no es lo bastante larga. Si es sobre
`TOKEN_ENCRYPTION_KEY`, vuelve al paso 5: falta la clave, sigue en `PLACEHOLDER` o
quedó incompleta al copiarla; lo mismo si es sobre `DATA_ENCRYPTION_KEY`. Si el
backend dice que `DATA_ENCRYPTION_KEY` **no es la clave con que se cifraron** los
datos, la clave cambió: configura la original (sin ella esos datos no se recuperan). Si el error es
sobre `FRONTEND_ORIGINS`, la lista está vacía o contiene `*`. Si el error empieza con
`SKIP_AUTH=true desactiva el login`, quedó `SKIP_AUTH=true` en un `.env` con URLs de un
dominio real: cámbialo a `SKIP_AUTH=false`.

## 7. Flujo de login y sesión

1. El frontend redirige al usuario a `GET /auth/login` del backend.
2. El backend redirige a la pantalla de consentimiento de Google.
3. Google redirige de vuelta a `GET /auth/callback?code=...`.
4. El backend intercambia el `code` por tokens de Google, valida el
   `id_token` y emite su propio JWT (firmado con `JWT_SECRET_KEY`).
5. El backend guarda ese JWT en la cookie `session` (`HttpOnly`,
   `SameSite=Lax`, `Path=/`, y `Secure` cuando `GOOGLE_REDIRECT_URI` usa https
   o no es localhost) y redirige a `FRONTEND_URL/auth/callback`. El token nunca viaja
   en la URL y el JavaScript del frontend no puede leerlo.
6. El frontend llama a `GET /auth/me`, que confirma la sesión y devuelve el
   docente y un `csrf_token`. El navegador adjunta la cookie solo.
7. En cada `POST`/`PUT`/`PATCH`/`DELETE` el frontend envía ese valor en el
   header `X-CSRF-Token`; si falta o no coincide con el de la sesión, el
   backend responde 403. Así otro sitio no puede modificar datos aprovechando
   la cookie del docente.
8. Para cerrar sesión, el frontend llama a `POST /auth/logout`, que borra la
   cookie (el frontend no puede hacerlo porque es `HttpOnly`) y el acceso a
   Google Drive guardado para ese docente.

**El callback y el frontend deben compartir host.** La cookie la pone el host
de `GOOGLE_REDIRECT_URI`, y el navegador solo la envía a ese mismo host. En
desarrollo funciona sin más: el callback es `localhost:8000`, el frontend
`localhost:5173` llama a la API por su proxy `/api`, y las cookies no
distinguen puertos. En producción, la API se sirve bajo el dominio del frontend
(nginx reenvía `/api` al backend) con
`GOOGLE_REDIRECT_URI=https://<tu-dominio>/api/auth/callback`: lo configuran
`docker-compose.https.yml` y `docker-compose.detras-de-proxy.yml`, ver
[DESPLIEGUE_PRODUCCION.md](./DESPLIEGUE_PRODUCCION.md). Si el backend viviera en
otro dominio, la cookie no llegaría a las peticiones del frontend.

El JWT no tiene estado en el servidor: cerrar sesión borra la cookie del
navegador, pero una copia del token seguiría siendo válida hasta su
vencimiento (`JWT_EXPIRE_MINUTES`, 24 h por defecto).

## 8. Sincronización con Google Drive

El `access_token` y `refresh_token` de Google obtenidos durante el login se
guardan en el backend asociados al email del docente, y se usan para subir
el detalle ABET (el Excel que se exporta desde "Estadísticas ABET") a una
carpeta llamada `GOOGLE_DRIVE_FOLDER_NAME` en el Google Drive del docente
autenticado.

El `access_token` (dura cerca de una hora) solo vive en memoria. El
`refresh_token` además se guarda cifrado con `TOKEN_ENCRYPTION_KEY` en la tabla
`tokens_drive`: tras un reinicio del backend, la primera subida lo usa para pedir
un `access_token` nuevo, sin que el docente vuelva a iniciar sesión. Si Google lo
rechaza (el docente revocó el permiso), se borra y la app pide volver a iniciar
sesión; un fallo temporal de Google no borra nada.
