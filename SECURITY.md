# Política de seguridad

## Cómo reportar una vulnerabilidad

Si encuentras una vulnerabilidad en ABET Eval, **no abras un issue público**. Escríbenos a:

**<karen_gisel.lopez@uao.edu.co, monica.chicangana@uao.edu.co>**

Incluye, si puedes:

- qué componente afecta (backend, frontend, configuración de nginx o de Docker);
- cómo reproducirla (pasos, petición o archivo de ejemplo);
- qué impacto crees que tiene;
- la versión o el commit con que la probaste.

No incluyas datos reales de estudiantes ni credenciales en el reporte. Te confirmaremos
que lo recibimos y te contaremos cómo avanza la corrección. Te pedimos no divulgarla
hasta que haya una versión corregida.

## Versiones soportadas

| Versión | Recibe correcciones de seguridad |
|---|---|
| 1.0.x | Sí |
| Anteriores a 1.0.0 | No: actualiza a 1.0.x |

## Controles implementados

Resumen de lo que hace la versión 1.0.0, con la prueba o el comando que lo verifica.
Detalle de despliegue en [DESPLIEGUE_PRODUCCION.md](./DESPLIEGUE_PRODUCCION.md).

| Control | Qué hace | Dónde se verifica |
|---|---|---|
| **HTTPS, TLS 1.2+** (RNF-13) | En los modos de producción, nginx (o el proxy de la universidad) termina TLS 1.2 y 1.3 con cifrados ECDHE+AEAD; TLS 1.0/1.1 se rechazan; http redirige a https; HSTS de un año. Con login real, el backend no arranca si las URLs públicas usan http fuera de esta máquina. El backend habla con Google y Gemini solo por https verificando el certificado. | `tests/test_https_produccion.py`, `tests/test_tls_salientes.py`; comandos `openssl s_client` y `curl` de DESPLIEGUE_PRODUCCION.md, sección 8 |
| **Cifrado de los datos del estudiante** (RNF-14) | Nombre, código y correo se guardan cifrados en la base (Fernet, AES-128-CBC + HMAC-SHA256, con subclave derivada por HKDF-SHA256 de `DATA_ENCRYPTION_KEY`). El backend no arranca con una clave equivocada. | `tests/test_cifrado_estudiantes.py` |
| **Cifrado de los tokens de Google Drive** | El `refresh_token` de cada docente se guarda cifrado con `TOKEN_ENCRYPTION_KEY` (Fernet). Cerrar sesión lo borra. | `tests/test_tokens_drive_persistentes.py` |
| **Sesión en cookie httpOnly** | El JWT de sesión (HS256 fijo, `exp` obligatorio) viaja en una cookie `HttpOnly`, `SameSite=Lax`, `Secure` fuera de localhost; el frontend no puede leerla. | `tests/test_auth_cookie.py` |
| **Expiración de la sesión** (RNF-16) | La sesión vence tras 8 h sin peticiones autenticadas (entre 7 h 45 min y 8 h, porque se renueva como mucho cada 15 min) y nunca dura más de 24 h desde el login, aunque haya actividad. Ambos tiempos son configurables y validados. | `tests/test_sesion_inactividad.py` |
| **Protección CSRF** | Las peticiones que modifican datos exigen el header `X-CSRF-Token`, igual al token aleatorio que lleva el JWT. El flujo OAuth valida el parámetro `state`. CORS solo admite orígenes explícitos (nunca `*`). | `tests/test_auth_csrf.py`, `tests/test_auth_cookie.py` |
| **Validadores de configuración** | Con login real (`SKIP_AUTH=false`) el backend no arranca si `JWT_SECRET_KEY` es corta o la de ejemplo, si `TOKEN_ENCRYPTION_KEY` o `DATA_ENCRYPTION_KEY` no son válidas o se repiten, si la contraseña de PostgreSQL es `abet_pass`, `PLACEHOLDER` o tiene menos de 12 caracteres, o si las URLs no usan https. `SKIP_AUTH=true` solo se acepta con URLs locales. | `tests/test_config_*.py`, `tests/test_https_produccion.py`, `tests/test_cifrado_estudiantes.py` |
| **Límites de tamaño** | nginx corta cuerpos de más de 3 MB; el backend, archivos de más de 2 MB y Excel que se expandirían a más de 20 MB (bombas zip). | `tests/test_limite_archivos.py` |
| **Límite de intentos** | nginx responde 429 a más de 10 peticiones por minuto (ráfaga de 10) al login con Google y su callback, y a más de 20 por minuto (ráfaga de 10) a las rutas que suben archivos, por IP del docente (detrás del proxy, la IP real vía `X-Forwarded-For`). El resto de la API no se limita. | Ráfagas de `curl`: DESPLIEGUE_PRODUCCION.md, sección 8 |
| **Inyección de fórmulas en Excel** (CWE-1236) | El texto que viene del usuario se escribe en los Excel exportados como texto literal, nunca como fórmula. | `tests/test_excel_formula_injection.py` |
| **Contenedores** | El backend corre con un usuario sin privilegios (UID 10001) y su código es de solo lectura; los tres servicios llevan `no-new-privileges`; la imagen de producción no lleva pruebas, pytest ni secretos; imágenes base con versión fija; healthchecks en los tres servicios. | DESPLIEGUE_PRODUCCION.md, sección «Contenedores» |
| **Cabeceras de seguridad** | En los modos de producción: CSP sin JavaScript en línea ni de otros dominios, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. | DESPLIEGUE_PRODUCCION.md, sección 8 |

## Lo que estos controles no cubren

Para no dar una idea equivocada del nivel de protección:

- **La sesión no se revoca en el servidor.** El JWT no tiene estado: cerrar sesión borra la
  cookie del navegador, pero una copia robada del token sigue sirviendo hasta que vence
  (como mucho 8 h sin uso o 24 h desde el login).
- **En la instalación local** (`docker-compose.prod.yml` en `http://localhost`) no hay TLS
  (no hace falta: el tráfico no sale de la máquina) y el límite de intentos no aplica,
  porque el frontend llama al backend directamente por el puerto 8000.
- **El límite de intentos es por IP.** Varios docentes que salgan a internet por la misma IP
  (NAT) comparten el cupo; una red de bots con muchas IP no queda frenada por él.
- **La CSP** permite estilos en línea (`style-src-elem 'unsafe-inline'`), que necesita la
  exportación del reporte a PDF (html2canvas).
- **Paquetes del sistema operativo** de las imágenes base: el escaneo de la 1.0.0 (Trivy)
  reportó avisos HIGH en paquetes de Debian sin arreglo publicado y en el binario `gosu` de
  la imagen de PostgreSQL. Se actualizan al reconstruir las imágenes cuando haya versiones
  corregidas (DESPLIEGUE_PRODUCCION.md, «Actualizar las imágenes base»).
- **No hay** registro de auditoría de accesos, segundo factor propio (se usa el de la cuenta
  de Google), ni WAF.
- **Disponibilidad y carga** (RNF-05, RNF-17) no se han validado con pruebas de carga.
