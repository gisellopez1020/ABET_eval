from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://abet:abet_pass@localhost:5432/abet_eval"
    azure_client_id: str = "PLACEHOLDER"
    azure_tenant_id: str = "PLACEHOLDER"
    azure_client_secret: str = "PLACEHOLDER"
    onedrive_folder_name: str = "ABET_Eval"
    skip_auth: bool = True

    model_config = {"env_file": ".env", "case_sensitive": False}


settings = Settings()
