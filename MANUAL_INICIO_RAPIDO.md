# ABET Eval: manual de inicio rápido

Guía para instalar y usar ABET Eval en tu propio computador con Windows, con el
inicio de sesión real de Google y la sincronización con Google Drive. La app corre
en tu equipo y se abre en el navegador en `http://localhost:5173`; no se publica en
internet.

Versión de la app: 1.0.0. Para instalarla en un servidor de la universidad, con
HTTPS, ver [DESPLIEGUE_PRODUCCION.md](./DESPLIEGUE_PRODUCCION.md).

---

## 1. Antes de empezar

**Necesitas:**

- Windows 10 u 11 de 64 bits y **permisos de administrador** (solo para instalar
  Docker Desktop).
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado, con el
  motor **WSL 2** (la opción que propone el instalador). Ábrelo y espera a que diga
  que el motor está en marcha.
- Una **cuenta institucional de Google** (la del correo de la universidad). La app
  solo acepta cuentas de la organización: con una cuenta personal (`@gmail.com`)
  Google no deja entrar.
- Espacio en disco: la app ocupa alrededor de 1 GB, más lo que ocupe Docker Desktop;
  deja unos 10 GB libres. Conexión a internet.
- Opcional: [Git](https://git-scm.com/download/win), para descargar y actualizar la
  app. Sin Git, se descarga en ZIP.

**Pídele al equipo del proyecto:**

- el **Client ID** y el **Client Secret** de Google (los crea el equipo en Google
  Cloud, ver [SETUP_GOOGLE.md](./SETUP_GOOGLE.md));
- opcional, una clave de Gemini, para la retroalimentación redactada con IA
  (sección 9).

Las demás claves las generas tú en el paso 3.

**Tiempo:** calcula media hora para la primera instalación. La primera construcción
descarga y compila la app, y tarda varios minutos según la conexión. Después, arrancar
toma alrededor de un minuto.

**Qué protege la app y qué te toca a ti.** En la base de datos, el nombre, el código
y el correo de cada estudiante se guardan **cifrados**; las **notas no** (la app las
usa para calcular los reportes). Por eso:

- **Cifra el disco del computador.** En Windows 11 Pro: BitLocker. En Windows Home:
  *Configuración → Privacidad y seguridad → Cifrado de dispositivo*, si aparece (depende
  del hardware). Si tu equipo no tiene ninguna de las dos, la base y los respaldos
  quedan legibles para quien tenga el disco: usa, si puedes, un equipo administrado por
  la universidad.
- **No expongas la app a internet** (no abras puertos en el router ni la compartas con
  otros equipos). Entre tu navegador y la app el tráfico no sale del computador; hacia
  Google va por HTTPS.

---

## 2. Descargar la app

Abre **PowerShell** (menú Inicio → escribe *PowerShell*). Todos los comandos de este
manual se escriben ahí y funcionan en Windows PowerShell 5.1 y en PowerShell 7.

**Con Git:**

```powershell
cd $HOME
git clone https://github.com/gisellopez1020/ABET_eval.git
cd ABET_eval
```

**Sin Git:** en la página del repositorio, *Code → Download ZIP*, y extrae el ZIP. Ojo:
Windows suele crear una carpeta **dentro de otra** (`ABET_eval-main\ABET_eval-main`).
La correcta es la que contiene `docker-compose.prod.yml`. Entra en ella:

```powershell
cd "$HOME\Downloads\ABET_eval-main\ABET_eval-main"
Test-Path docker-compose.prod.yml     # debe responder True
```

Desde aquí, **todos los comandos se ejecutan en esa carpeta.**

---

## 3. Crear el archivo `.env`

El `.env` guarda la configuración de tu instalación: tus claves y las credenciales de
Google. **Créalo antes del primer arranque** (sección 4): la app se construye con lo
que diga ese archivo.

### 3.1 Crear el archivo

```powershell
New-Item -ItemType File .env
notepad .env
```

Así el archivo se llama exactamente `.env`, sin `.txt`. Pega este bloque, sin cambiar
nada todavía:

```env
# ABET Eval: configuración de este computador. No compartas este archivo.
SKIP_AUTH=false

# Base de datos: contraseña propia (paso 3.2)
POSTGRES_PASSWORD=<<PEGAR>>

# Google: lo entrega el equipo
GOOGLE_CLIENT_ID=<<PEGAR AQUÍ el Client ID>>
GOOGLE_CLIENT_SECRET=<<PEGAR AQUÍ el Client Secret>>
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/callback

# Claves de la app (paso 3.2): las tres distintas
JWT_SECRET_KEY=<<PEGAR_JWT>>
TOKEN_ENCRYPTION_KEY=<<PEGAR AQUÍ la clave de Drive>>
DATA_ENCRYPTION_KEY=<<PEGAR AQUÍ la clave de los estudiantes>>

# Dirección de la app en este computador
FRONTEND_URL=http://localhost:5173
FRONTEND_ORIGINS=http://localhost:5173

# Nombre de la carpeta que la app crea en tu Google Drive
GOOGLE_DRIVE_FOLDER_NAME=ABET_Eval

# Opcional: retroalimentación con IA (sección 9). Con PLACEHOLDER no se usa.
GEMINI_API_KEY=PLACEHOLDER
```

Los `<<...>>` son marcadores **inválidos a propósito**: si alguno se queda sin
reemplazar, la app se niega a arrancar en vez de funcionar con un valor falso.

### 3.2 Generar tus claves

Copia y pega en PowerShell (no necesita Python):

```powershell
function Nueva-Clave([int]$n) { $b = New-Object byte[] $n; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b).Replace('+','-').Replace('/','_') }
"POSTGRES_PASSWORD=$(Nueva-Clave 18)"
"JWT_SECRET_KEY=$(Nueva-Clave 32)"
"TOKEN_ENCRYPTION_KEY=$(Nueva-Clave 32)"
"DATA_ENCRYPTION_KEY=$(Nueva-Clave 32)"
```

Salen cuatro líneas listas: reemplaza con ellas las cuatro líneas que tienen
`<<PEGAR>>`, `<<PEGAR_JWT>>` y las dos claves. Cada vez que lo ejecutas salen claves
distintas: ejecútalo **una sola vez**.

Si tienes Python, es equivalente:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(18))"                        # POSTGRES_PASSWORD
python -c "import secrets; print(secrets.token_urlsafe(32))"                        # JWT_SECRET_KEY
python -c "import base64,os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"  # TOKEN_ y DATA_ENCRYPTION_KEY (una vez cada una)
```

Luego reemplaza `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` con lo que te entregó el
equipo. Guarda el archivo (Ctrl+S) y cierra el Bloc de notas.

> ### ⚠️ Guarda `DATA_ENCRYPTION_KEY` fuera de este computador
>
> Con ella se cifran el nombre, el código y el correo de tus estudiantes. **Si se
> pierde, esos datos no se pueden recuperar**, ni siquiera desde un respaldo, y nadie
> (tampoco el equipo del proyecto) puede recuperarlos.
>
> - Cópiala en un **gestor de contraseñas** (o en el lugar que indique la universidad
>   para guardar secretos), **aparte de los respaldos**: un respaldo sin su clave no
>   sirve, y quien tenga los dos tiene todo.
> - **No la cambies** después del primer arranque. Si el `.env` tiene una clave
>   distinta de la original, la app no arranca y el registro dice: *"DATA_ENCRYPTION_KEY
>   no es la clave con que se cifraron (cambió o se perdió)"*. La solución es volver a
>   poner la original.
> - Guarda también `POSTGRES_PASSWORD`: después del primer arranque **no se puede
>   cambiar editando el `.env`** (sección 11).

### 3.3 Comprobar antes de arrancar

```powershell
Select-String -Path .env -Pattern '<<'
Get-ChildItem .env*
```

El primero **no debe mostrar nada**. Si muestra alguna línea, todavía hay un marcador:
corrígelo antes de seguir. Es importante: la base de datos se crea con la contraseña
que haya en el `.env` la primera vez, incluso si es un marcador. El segundo debe
mostrar `.env` (además de `.env.example`, que viene con la app), y **no** `.env.txt`.

---

## 4. Levantar la app y comprobar

Con Docker Desktop abierto:

```powershell
docker compose -f docker-compose.prod.yml up -d --build
```

La primera vez tarda varios minutos. Termina con varias líneas `Started`, pero eso
**no** garantiza que la app esté bien: compruébalo a los 1 o 2 minutos con

```powershell
docker compose -f docker-compose.prod.yml ps
```

Los tres servicios (`postgres`, `backend` y `frontend`) deben decir **`(healthy)`**.
Si alguno dice `(health: starting)`, espera un poco y repite. Si el backend dice
`Restarting`, no arrancó: mira el motivo con

```powershell
docker compose -f docker-compose.prod.yml logs backend --tail 30
```

y busca el mensaje en la sección 11.

Con los tres en `healthy`, abre **http://localhost:5173** en el navegador.

---

## 5. Detener, volver a arrancar y actualizar

- **Detener:** `docker compose -f docker-compose.prod.yml stop`
- **Volver a arrancar:** `docker compose -f docker-compose.prod.yml up -d`
- Mientras Docker Desktop esté abierto, la app vuelve a arrancar sola al reiniciar el
  computador.

**Nunca agregues `-v`** a `docker compose ... down`: borra la base de datos con todas
las asignaturas, estudiantes y notas.

**Actualizar a una versión nueva:** haz un respaldo (sección 10); con Git,
`git pull`; con ZIP, descarga el nuevo y copia tu `.env` a la carpeta nueva. Después:
`docker compose -f docker-compose.prod.yml up -d --build`. Los datos se conservan,
aunque la carpeta sea otra.

---

## 6. Primer ingreso con Google

1. En http://localhost:5173, pulsa **Iniciar sesión con Google** y elige tu cuenta
   institucional.
2. Google muestra los permisos que pide la app: ver tu nombre y tu correo, y acceder
   **solo a los archivos de Drive que cree la propia app** (no al resto de tu Drive).
   Acéptalos. Google los muestra **en cada ingreso**: es normal.
3. Entras a **Inicio**.

La sesión se cierra sola tras **8 horas sin usar la app**, y como máximo **24 horas**
después de iniciarla: la app vuelve a la pantalla de inicio de sesión y basta con
entrar de nuevo. Reiniciar el computador no desconecta Drive.

La carpeta **`ABET_Eval`** aparece en tu Google Drive la primera vez que generas un
detalle de actividad (sección 8). Si Google retira el acceso a Drive (por ejemplo, si
revocas el permiso desde tu cuenta de Google), al exportar la app avisa *"No se pudo
sincronizar con Drive, pero puedes descargar el archivo"* y *"Vuelve a iniciar sesión
con Google"*: pulsa **Cerrar sesión** (al pie del menú) y entra de nuevo.

---

## 7. Cargar el catálogo de Student Outcomes

Antes de crear asignaturas hay que cargar los Resultados de Aprendizaje y Criterios de
Evaluación de tu programa.

1. Menú **Student Outcomes → Importar CSV**.
2. Elige la colección de tu carrera, o *Crear una nueva colección…*.
3. Sube el CSV del programa. Para Ingeniería Informática de la UAO viene con la app:
   `backend\scripts\student_outcomes_ingenieria_informatica.csv` (8 Resultados de
   Aprendizaje y 17 Criterios). Para otro programa, el formato está en **Ayuda →
   Student Outcomes**.

---

## 8. Recorrido con un curso real

El detalle de cada pantalla está en **Ayuda** (al pie del menú). En resumen:

1. **Asignaturas → Nueva asignatura:** nombre, código, período y, en *Configuración
   ABET*, los Resultados de Aprendizaje del curso.
2. Abre la asignatura y crea sus **secciones**. En cada sección, agrega estudiantes uno
   por uno o con **Importar CSV / Excel** (con vista previa antes de guardar).
   Puedes volver a importar la misma lista sin duplicar a nadie: los estudiantes cuyo
   código ya está en la sección (o repetido dentro del archivo) se omiten, y la vista
   previa te dice cuáles antes de importar.
3. Crea las **actividades** del curso y su rúbrica en **Rúbrica ABET** (a mano o
   importándola de CSV o Excel). Los pesos deben sumar 100 %.
4. Para actividades grupales, arma los equipos en **Proyectos y equipos**.
5. Califica con el botón **Calificar** de cada actividad, en el detalle de la
   asignatura.
6. Resultados:
   - en la asignatura, **Ver reportes ABET** (exportable a PDF);
   - en **Estadísticas ABET**, por actividad: **Exportar resumen** (Excel) y **Generar
     detalle**, que crea el Excel institucional con una hoja por equipo o estudiante y
     lo sube a tu Drive.

Ten en cuenta:

- El Excel de detalle lleva **nombres y códigos de los estudiantes en claro**. Se sube
  a tu propio Google Drive (por HTTPS, a tu cuenta institucional) y se descarga a tu
  computador: trátalo como un documento con datos personales.
- Los estudiantes se ordenan alfabéticamente en español: sin distinguir tildes ni
  mayúsculas (Á junto a A) y con la Ñ después de la N.

---

## 9. Retroalimentación con IA (opcional)

En la pantalla de calificación, la app arma una retroalimentación con los criterios
cumplidos y por reforzar. Si el equipo te entregó una clave de Gemini (o la creas en
https://aistudio.google.com/apikey), además la **redacta como un texto**.

Para activarla, pon la clave en `GEMINI_API_KEY` del `.env` y aplica el cambio con
`docker compose -f docker-compose.prod.yml up -d`.

- **Sin clave** (`PLACEHOLDER`) se muestra la versión estructurada. **No es un error.**
- A Gemini (Google) viaja solo el **nombre de cada aspecto de la rúbrica y el texto de
  sus criterios**, con si se cumplieron o no. **No** viajan nombres, códigos ni correos
  de estudiantes, **salvo que tú los escribas** dentro del nombre de un aspecto o del
  texto de un criterio: no lo hagas.

---

## 10. Respaldo y restauración

Haz un respaldo **al menos una vez por semana** durante el semestre y **antes de cada
actualización**. Se guarda **fuera de la carpeta de la app**, cifrado con una frase
propia.

**Una sola vez:** instala GnuPG (cifra los respaldos):

```powershell
winget install --id GnuPG.Gpg4win -e
```

Cierra y vuelve a abrir PowerShell, y comprueba con `gpg --version`.

### Crear un respaldo

En la carpeta de la app:

```powershell
$destino = Join-Path ([Environment]::GetFolderPath('MyDocuments')) "Respaldos ABET"
New-Item -ItemType Directory -Force $destino | Out-Null
$nombre = "abet-" + (Get-Date -Format "yyyy-MM-dd_HHmm")
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U abet -d abet_eval -Fc -f /tmp/respaldo.dump
docker compose -f docker-compose.prod.yml cp postgres:/tmp/respaldo.dump "$env:TEMP\$nombre.dump"
docker compose -f docker-compose.prod.yml exec postgres rm /tmp/respaldo.dump
gpg --symmetric --cipher-algo AES256 -o "$destino\$nombre.dump.gpg" "$env:TEMP\$nombre.dump"
Remove-Item "$env:TEMP\$nombre.dump"
Get-ChildItem $destino
```

`gpg` pide una **frase para el respaldo** (dos veces) y escribe avisos como
`AES256.CFB encrypted data`: son informativos, no errores. Usa la misma siempre y
guárdala en el gestor de contraseñas, **aparte** de `DATA_ENCRYPTION_KEY`. El archivo
sin cifrar solo pasa por la carpeta temporal y se borra; en *Documentos* queda el
`.dump.gpg`. Si *Documentos* se sincroniza con OneDrive, el respaldo también sube allí,
cifrado.

### Restaurar un respaldo

Sirve para recuperar los datos en este computador o en otro, **con la misma
`DATA_ENCRYPTION_KEY`** (y la misma `POSTGRES_PASSWORD`, si es otro computador) en el
`.env`. La app debe estar instalada y arrancada (sección 4). Restaurar **reemplaza**
todos los datos actuales por los del respaldo.

```powershell
$respaldo = Join-Path ([Environment]::GetFolderPath('MyDocuments')) "Respaldos ABET\abet-AAAA-MM-DD_HHMM.dump.gpg"   # el que quieras restaurar
gpg -o "$env:TEMP\abet-restaurar.dump" --decrypt $respaldo
docker compose -f docker-compose.prod.yml stop backend frontend
docker compose -f docker-compose.prod.yml cp "$env:TEMP\abet-restaurar.dump" postgres:/tmp/restaurar.dump
docker compose -f docker-compose.prod.yml exec postgres pg_restore -U abet -d abet_eval --clean --if-exists --no-owner /tmp/restaurar.dump
docker compose -f docker-compose.prod.yml exec postgres rm /tmp/restaurar.dump
Remove-Item "$env:TEMP\abet-restaurar.dump"
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

`gpg` pide la frase del respaldo. Si la `DATA_ENCRYPTION_KEY` del `.env` no es la del respaldo, el backend no arranca y
el registro dice que la clave no es la correcta: pon la original y vuelve a ejecutar
`up -d`.

**Prueba la restauración** al menos una vez: un respaldo que nunca se restauró no está
comprobado.

---

## 11. Si algo falla

Primero, siempre: `docker compose -f docker-compose.prod.yml ps` y, si el backend no
está `healthy`, `docker compose -f docker-compose.prod.yml logs backend --tail 30`.

| Lo que ves | Qué hacer |
|---|---|
| Un comando `docker` falla con un error de conexión | Docker Desktop no está abierto o no ha terminado de arrancar. Ábrelo, espera a que el motor esté en marcha y repite. |
| `Bind for 0.0.0.0:8000 failed: port is already allocated` (o 5173) | Otra copia de la app (por ejemplo, la instalación de desarrollo) u otro programa usa ese puerto. Detenla y repite `up -d`. |
| En el registro: `JWT_SECRET_KEY no está configurada de forma segura` | Falta la clave o quedó el marcador. Genera una (paso 3.2), ponla en el `.env` y ejecuta `up -d`. |
| `TOKEN_ENCRYPTION_KEY no es una clave Fernet válida` o `DATA_ENCRYPTION_KEY no es una clave válida` | Clave faltante, con el marcador o copiada incompleta (debe tener 44 caracteres). Corrígela y `up -d`. **Si ya tenías datos, no generes una `DATA_ENCRYPTION_KEY` nueva**: pon la original. |
| `DATA_ENCRYPTION_KEY debe ser distinta de TOKEN_ENCRYPTION_KEY y de JWT_SECRET_KEY` | Pegaste la misma clave dos veces. Genera las que falten. |
| `La contraseña de PostgreSQL ... es la de ejemplo 'abet_pass'` ... | Quedó el marcador o una contraseña de menos de 12 caracteres. Genera una (paso 3.2), ponla en `POSTGRES_PASSWORD` y sigue la fila siguiente. |
| `password authentication failed for user "abet"` | La base se creó con otra contraseña (por ejemplo, el marcador del primer arranque). **No borres nada**: cámbiala dentro de la base, abajo. |
| `DATA_ENCRYPTION_KEY no es la clave con que se cifraron` | El `.env` tiene otra clave. Pon la original (del gestor de contraseñas) y `up -d`. Sin ella, los datos de los estudiantes no se recuperan. |
| Google no te deja entrar | Usa tu cuenta institucional. Si el error menciona la URI de redirección, avisa al equipo: debe registrar `http://localhost:8000/auth/callback`. |
| Vuelves a la pantalla de inicio de sesión | La sesión caducó (8 h sin uso o 24 h en total). Entra de nuevo; no se pierde nada guardado. |
| *"Vuelve a iniciar sesión con Google"* al exportar | Drive se desconectó: **Cerrar sesión** y entra de nuevo. El archivo se puede descargar igual. |

**Cambiar la contraseña de la base sin perder datos.** Con la contraseña nueva ya
escrita en `POSTGRES_PASSWORD` del `.env`:

```powershell
docker compose -f docker-compose.prod.yml exec postgres psql -U abet -d abet_eval -c "\password abet"
docker compose -f docker-compose.prod.yml up -d
```

El primero pide la contraseña nueva dos veces: pega la misma del `.env`. No pide la
anterior. Después, `ps` debe mostrar los tres servicios `healthy`.

Si nada de esto lo resuelve, envía al equipo la salida de
`docker compose -f docker-compose.prod.yml logs backend --tail 50`. **Antes, revísala:**
no debe contener claves; si las tiene, bórralas del texto.
