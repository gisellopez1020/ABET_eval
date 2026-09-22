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
   - Producción: `https://<tu-dominio-backend>/auth/callback`
4. Guarda el **Client ID** y el **Client Secret** generados.

## 4. Variables de entorno del backend

Copia estos valores al archivo `.env`:

```bash
GOOGLE_CLIENT_ID=<client-id-de-google>
GOOGLE_CLIENT_SECRET=<client-secret-de-google>
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/callback

# Clave para firmar el JWT propio de la app
JWT_SECRET_KEY=<clave-secreta-aleatoria>

# URL del frontend a la que se redirige tras un login exitoso
FRONTEND_URL=http://localhost:5173

GOOGLE_DRIVE_FOLDER_NAME=ABET_Eval

SKIP_AUTH=false
```

Genera un `JWT_SECRET_KEY` seguro, por ejemplo:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

## 5. Flujo de login

1. El frontend redirige al usuario a `GET /auth/login` del backend.
2. El backend redirige a la pantalla de consentimiento de Google.
3. Google redirige de vuelta a `GET /auth/callback?code=...`.
4. El backend intercambia el `code` por tokens de Google, valida el
   `id_token` y emite su propio JWT (firmado con `JWT_SECRET_KEY`).
5. El backend redirige al frontend (`FRONTEND_URL/auth/callback?token=...`)
   con el JWT propio de la app, que el frontend debe guardar y enviar como
   `Authorization: Bearer <token>` en las siguientes peticiones.

## 6. Sincronización con Google Drive

El `access_token` y `refresh_token` de Google obtenidos durante el login se
guardan en el backend asociados al email del docente, y se usan para subir
los resúmenes de calificaciones a una carpeta llamada
`GOOGLE_DRIVE_FOLDER_NAME` en el Google Drive del docente autenticado.
