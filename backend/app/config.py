from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "postgresql+psycopg://utlaan:utlaan@localhost:5432/utlaan"

    # Auth
    secret_key: str = "bytt-meg-i-produksjon"
    access_token_expire_minutes: int = 60 * 12  # 12 timer
    algorithm: str = "HS256"

    # Førstegangsoppsett: admin-bruker som opprettes hvis databasen er tom
    first_admin_username: str = "admin"
    first_admin_password: str = "admin123"
    first_admin_name: str = "Administrator"

    # CORS – kommaseparert liste. "*" tillater alt (greit bak Next.js-proxy).
    cors_origins: str = "*"

    @property
    def cors_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
