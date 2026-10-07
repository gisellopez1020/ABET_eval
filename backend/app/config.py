from pydantic import model_validator
from pydantic_settings import BaseSettings

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


settings = Settings()
