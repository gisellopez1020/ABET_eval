from cryptography.fernet import Fernet
from pydantic import model_validator
from pydantic_settings import BaseSettings

from app.utils.claves import clave_maestra_valida
from app.utils.urls import es_host_local, puede_ser_http

JWT_SECRET_MIN_LENGTH = 32


class Settings(BaseSettings):
    database_url: str = "postgresql://abet:abet_pass@localhost:5432/abet_eval"
    google_client_id: str = "PLACEHOLDER"
    google_client_secret: str = "PLACEHOLDER"
    google_redirect_uri: str = "http://localhost:8000/auth/callback"
    jwt_secret_key: str = "PLACEHOLDER"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    # Clave Fernet con que se cifra el refresh_token de Google Drive en la base de datos
    token_encryption_key: str = "PLACEHOLDER"
    # Clave maestra con que se cifran los datos personales del estudiante (RNF-14).
    # Distinta de TOKEN_ENCRYPTION_KEY y de JWT_SECRET_KEY. Si se pierde, esos datos
    # no se pueden recuperar.
    data_encryption_key: str = "PLACEHOLDER"
    frontend_url: str = "http://localhost:5173"
    # Orígenes permitidos por CORS, separados por comas. Texto (no list[str])
    # para que se pueda escribir sin JSON en la variable de entorno.
    frontend_origins: str = "http://localhost:5173,http://frontend:5173"
    google_drive_folder_name: str = "ABET_Eval"
    skip_auth: bool = False
    # Redacción con IA de la retroalimentación. Sin key (vacía o PLACEHOLDER) no es un
    # error: se muestra la retroalimentación estructurada, sin llamar a la API.
    gemini_api_key: str = "PLACEHOLDER"
    gemini_model: str = "gemini-3.8-flash"
    gemini_thinking_level: str = "low"
    # Si Gemini no responde en este tiempo se muestra la estructurada
    gemini_timeout_segundos: float = 10.0
    # Swagger (/docs), ReDoc (/redoc) y /openapi.json. Solo el modo HTTPS
    # (docker-compose.https.yml) los apaga: detrás del prefijo /api de nginx no cargan
    api_docs: bool = True

    # hide_input_in_errors: que un error de validación no imprima secretos en los logs
    model_config = {
        "env_file": ".env",
        "case_sensitive": False,
        "hide_input_in_errors": True,
    }

    @model_validator(mode="after")
    def validar_jwt_secret_key(self) -> "Settings":
        """Con login real (SKIP_AUTH=false) el secreto del JWT debe ser seguro.

        Con el valor por defecto cualquiera podría forjar un JWT válido y
        hacerse pasar por cualquier docente, así que la app no debe arrancar.
        """
        if self.skip_auth:
            return self
        secreto = self.jwt_secret_key.strip()
        if (
            not secreto
            or secreto == "PLACEHOLDER"
            or len(secreto) < JWT_SECRET_MIN_LENGTH
        ):
            raise ValueError(
                "JWT_SECRET_KEY no está configurada de forma segura (valor por "
                f"defecto 'PLACEHOLDER', vacía o con menos de {JWT_SECRET_MIN_LENGTH} "
                "caracteres). Con SKIP_AUTH=false se usa para firmar los JWT de "
                "sesión y con un valor público cualquiera podría forjar tokens. "
                "Genera una con: "
                'python -c "import secrets; print(secrets.token_urlsafe(32))" '
                "y configúrala en la variable de entorno JWT_SECRET_KEY, o usa "
                "SKIP_AUTH=true para el modo demo/desarrollo."
            )
        return self

    @model_validator(mode="after")
    def validar_token_encryption_key(self) -> "Settings":
        """Con login real (SKIP_AUTH=false) el refresh_token de Drive se guarda cifrado.

        Sin una clave Fernet válida no se podría guardar, y la sesión de Drive se
        perdería en cada reinicio; con el valor por defecto sería una clave pública.
        Va después de validar_jwt_secret_key para no tapar su mensaje.
        """
        if self.skip_auth:
            return self
        clave = self.token_encryption_key.strip()
        try:
            # Fernet rechaza lo que no sea base64 urlsafe de 32 bytes ("PLACEHOLDER" incluido)
            Fernet(clave.encode())
            valida = True
        except ValueError:
            valida = False
        if not valida:
            raise ValueError(
                "TOKEN_ENCRYPTION_KEY no es una clave Fernet válida (valor por defecto "
                "'PLACEHOLDER', vacía o mal formada). Con SKIP_AUTH=false se usa para "
                "cifrar en la base de datos el acceso a Google Drive de cada docente. "
                "Genera una con: "
                'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" '
                "(o con el comando de PowerShell de SETUP_GOOGLE.md) y configúrala en la "
                "variable de entorno TOKEN_ENCRYPTION_KEY, o usa SKIP_AUTH=true para el "
                "modo demo/desarrollo."
            )
        return self

    @model_validator(mode="after")
    def validar_data_encryption_key(self) -> "Settings":
        """Clave de los datos personales del estudiante (RNF-14).

        Con SKIP_AUTH=false es obligatoria: sin ella los nombres, códigos y correos se
        guardarían en claro. Con SKIP_AUTH=true es opcional (sin ella no se cifra y se
        avisa al arrancar), pero si se configura debe ser válida: una clave con un
        error de tipeo no debe hacer que se guarde en claro sin aviso. En los dos
        modos debe ser distinta de las otras claves. Va después de los validadores
        de JWT_SECRET_KEY y TOKEN_ENCRYPTION_KEY para no tapar sus mensajes.
        """
        clave = self.data_encryption_key.strip()
        configurada = bool(clave) and clave != "PLACEHOLDER"
        if not configurada and self.skip_auth:
            return self
        if not configurada or not clave_maestra_valida(clave):
            raise ValueError(
                "DATA_ENCRYPTION_KEY no es una clave válida (valor por defecto "
                "'PLACEHOLDER', vacía o mal formada: deben ser 32 bytes en base64 urlsafe, "
                "44 caracteres). Con SKIP_AUTH=false es obligatoria: con ella se cifran "
                "en la base de datos el nombre, el código y el correo de cada estudiante. "
                "Genera una con: "
                'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" '
                "y GUÁRDALA EN UN LUGAR SEGURO: si se pierde, esos datos no se pueden "
                "recuperar. Ver DESPLIEGUE_PRODUCCION.md."
            )
        if clave in (self.token_encryption_key.strip(), self.jwt_secret_key.strip()):
            raise ValueError(
                "DATA_ENCRYPTION_KEY debe ser distinta de TOKEN_ENCRYPTION_KEY y de "
                "JWT_SECRET_KEY: cada clave protege una cosa distinta y filtrar una no "
                "debe exponer las demás. Genera otra con: "
                'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
            )
        return self

    @property
    def gemini_habilitado(self) -> bool:
        key = self.gemini_api_key.strip()
        return bool(key) and key != "PLACEHOLDER"

    @property
    def lista_frontend_origins(self) -> list[str]:
        return [o.strip() for o in self.frontend_origins.split(",") if o.strip()]

    @model_validator(mode="after")
    def validar_frontend_origins(self) -> "Settings":
        """Los orígenes de CORS deben ser explícitos.

        Con allow_credentials=True, Starlette responde a "*" devolviendo el
        Origin de quien pregunte cuando la petición trae cookies: cualquier
        sitio podría usar la sesión del docente. Por eso no se acepta.
        """
        origenes = self.lista_frontend_origins
        if not origenes or "*" in origenes:
            raise ValueError(
                "FRONTEND_ORIGINS debe ser una lista de orígenes explícitos separados "
                "por comas (p. ej. 'https://abet.uao.edu.co'); no puede estar vacía ni "
                "contener '*', porque la API usa cookies de sesión y con '*' cualquier "
                "sitio podría hacer peticiones autenticadas en nombre del docente."
            )
        return self

    @model_validator(mode="after")
    def validar_https_fuera_de_localhost(self) -> "Settings":
        """Con login real (SKIP_AUTH=false) las URLs públicas deben usar https (RNF-13).

        Por http viajarían en claro el código de autorización de Google y la cookie de
        sesión. Solo localhost, 127.0.0.1, ::1 y el servicio `frontend` de docker
        compose pueden ir por http: ese tráfico no sale de la máquina. Va después de
        los validadores de secretos para no tapar sus mensajes.
        """
        if self.skip_auth:
            return self
        sin_https = [
            nombre
            for nombre, urls in (
                ("GOOGLE_REDIRECT_URI", [self.google_redirect_uri]),
                ("FRONTEND_URL", [self.frontend_url]),
                ("FRONTEND_ORIGINS", self.lista_frontend_origins),
            )
            if not all(puede_ser_http(url) for url in urls)
        ]
        if sin_https:
            raise ValueError(
                f"{', '.join(sin_https)} debe usar https:// con SKIP_AUTH=false cuando "
                "apunta a un servidor que no es esta máquina: por http viajarían sin "
                "cifrar el código de autorización de Google y la cookie de sesión. Solo "
                "localhost, 127.0.0.1, ::1 y el servicio 'frontend' de docker compose "
                "pueden usar http. Para el despliegue con TLS ver DESPLIEGUE_PRODUCCION.md."
            )
        return self

    @model_validator(mode="after")
    def validar_skip_auth_solo_local(self) -> "Settings":
        """SKIP_AUTH=true solo con URLs locales.

        En ese modo get_current_user devuelve siempre el usuario simulado sin
        cookie ni CSRF: desplegado en un dominio real, cualquiera entraría como
        ese docente. Va después de los otros validadores para no tapar sus mensajes.
        """
        if not self.skip_auth:
            return self
        no_locales = [
            nombre
            for nombre, urls in (
                ("GOOGLE_REDIRECT_URI", [self.google_redirect_uri]),
                ("FRONTEND_URL", [self.frontend_url]),
                ("FRONTEND_ORIGINS", self.lista_frontend_origins),
            )
            if not all(es_host_local(url) for url in urls)
        ]
        if no_locales:
            raise ValueError(
                "SKIP_AUTH=true desactiva el login: cualquiera con acceso de red a la "
                "API entra sin iniciar sesión, sin cookie ni CSRF, como el usuario "
                "simulado profesor.test@uao.edu.co. Ese modo es solo para desarrollo "
                f"local, pero {', '.join(no_locales)} apunta a un dominio que no es "
                "local. En un despliegue real configura SKIP_AUTH=false y el login con "
                "Google (ver SETUP_GOOGLE.md); si es desarrollo, usa localhost o "
                "127.0.0.1 en esas URLs."
            )
        return self


settings = Settings()
