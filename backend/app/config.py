from pydantic_settings import BaseSettings


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

    model_config = {"env_file": ".env", "case_sensitive": False}


settings = Settings()
