# Configuración de Google OAuth 2.0 y Google Drive

Esta guía explica cómo configurar el login real con Google (Authorization Code
flow) y la sincronización con Google Drive para el backend de ABET Eval.
Con `SKIP_AUTH=true` (valor por defecto) no es necesario nada de esto, ya que la app
usa un usuario simulado y no llama a Google.

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
     frontend; ver la nota del paso 6)
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

Guárdala para el siguiente paso. No la subas al repositorio y usa una distinta
en cada entorno (desarrollo, producción).

## 5. Variables de entorno del backend

Copia estos valores al archivo `.env`:

```bash
GOOGLE_CLIENT_ID=<client-id-de-google>
GOOGLE_CLIENT_SECRET=<client-secret-de-google>
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/callback

# Clave generada en el paso 4 (mínimo 32 caracteres)
JWT_SECRET_KEY=<clave-generada-en-el-paso-4>

# URL del frontend a la que se redirige tras un login exitoso
FRONTEND_URL=http://localhost:5173

# Orígenes que CORS acepta, separados por comas. No se permite "*": la sesión
# viaja en una cookie y con "*" cualquier sitio podría usarla.
FRONTEND_ORIGINS=http://localhost:5173

GOOGLE_DRIVE_FOLDER_NAME=ABET_Eval

SKIP_AUTH=false
```

Si al arrancar el backend falla con un error sobre `JWT_SECRET_KEY`, vuelve al
paso 4: la clave no está configurada o no es lo bastante larga. Si el error es
sobre `FRONTEND_ORIGINS`, la lista está vacía o contiene `*`.

## 6. Flujo de login y sesión

1. El frontend redirige al usuario a `GET /auth/login` del backend.
2. El backend redirige a la pantalla de consentimiento de Google.
3. Google redirige de vuelta a `GET /auth/callback?code=...`.
4. El backend intercambia el `code` por tokens de Google, valida el
   `id_token` y emite su propio JWT (firmado con `JWT_SECRET_KEY`).
5. El backend guarda ese JWT en la cookie `session` (`HttpOnly`,
   `SameSite=Lax`, `Path=/`, y `Secure` cuando `GOOGLE_REDIRECT_URI` no es
   localhost) y redirige a `FRONTEND_URL/auth/callback`. El token nunca viaja
   en la URL y el JavaScript del frontend no puede leerlo.
6. El frontend llama a `GET /auth/me`, que confirma la sesión y devuelve el
   docente y un `csrf_token`. El navegador adjunta la cookie solo.
7. En cada `POST`/`PUT`/`PATCH`/`DELETE` el frontend envía ese valor en el
   header `X-CSRF-Token`; si falta o no coincide con el de la sesión, el
   backend responde 403. Así otro sitio no puede modificar datos aprovechando
   la cookie del docente.
8. Para cerrar sesión, el frontend llama a `POST /auth/logout`, que borra la
   cookie (el frontend no puede hacerlo porque es `HttpOnly`).

**El callback y el frontend deben compartir host.** La cookie la pone el host
de `GOOGLE_REDIRECT_URI`, y el navegador solo la envía a ese mismo host. En
desarrollo funciona sin más: el callback es `localhost:8000`, el frontend
`localhost:5173` llama a la API por su proxy `/api`, y las cookies no
distinguen puertos. En producción, sirve la API bajo el dominio del frontend
(un proxy inverso que reenvíe `/api` al backend) y usa
`GOOGLE_REDIRECT_URI=https://<tu-dominio>/api/auth/callback` y
`VITE_API_URL=https://<tu-dominio>/api`. Si el backend vive en otro dominio, la
cookie no llegaría a las peticiones del frontend.

El JWT no tiene estado en el servidor: cerrar sesión borra la cookie del
navegador, pero una copia del token seguiría siendo válida hasta su
vencimiento (`JWT_EXPIRE_MINUTES`, 24 h por defecto).

## 7. Sincronización con Google Drive

El `access_token` y `refresh_token` de Google obtenidos durante el login se
guardan en el backend asociados al email del docente, y se usan para subir
el detalle ABET (el Excel que se exporta desde "Estadísticas ABET") a una
carpeta llamada `GOOGLE_DRIVE_FOLDER_NAME` en el Google Drive del docente
autenticado.
