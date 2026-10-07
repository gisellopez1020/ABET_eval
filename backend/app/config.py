from pydantic import model_validator
from pydantic_settings import BaseSettings

from app.utils.urls import es_host_local

JWT_SECRET_MIN_LENGTH = 32


class Settings(BaseSettings):
    database_url: str = "postgresql://abet:abet_pass@localhost:5432/abet_eval"
    google_client_id: str = "PLACEHOLDER"
    google_client_secret: str = "PLACEHOLDER"
    google_redirect_uri: str = "http://localhost:8000/auth/callback"
    jwt_secret_key: str = "PLACEHOLDER"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    frontend_url: str = "http://localhost:5173"
    # Orígenes permitidos por CORS, separados por comas. Texto (no list[str])
    # para que se pueda escribir sin JSON en la variable de entorno.
    frontend_origins: str = "http://localhost:5173,http://frontend:5173"
    google_drive_folder_name: str = "ABET_Eval"
    skip_auth: bool = False

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
