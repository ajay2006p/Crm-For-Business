import os
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "RecruitKr Business OS"
    secret_key: str = os.getenv("SECRET_KEY", "change-me-in-production-recruitkr-2026")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 12
    mongodb_uri: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    mongodb_db: str = os.getenv("MONGODB_DB", "recruitkr_os")
    upload_dir: str = os.getenv("UPLOAD_DIR", "uploads")
    max_upload_mb: int = 15
    allowed_doc_ext: set = {".pdf", ".xlsx", ".xls", ".csv", ".png", ".jpg", ".jpeg", ".doc", ".docx"}
    rate_limit: str = "120/minute"
    cors_origins: list[str] = ["*"]
    default_admin_email: str = os.getenv("ADMIN_EMAIL", "admin@recruitkr.com")
    default_admin_password: str = os.getenv("ADMIN_PASSWORD", "Admin@123")
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    # Toggle to disable authentication for development / demos
    auth_required: bool = os.getenv("AUTH_REQUIRED", "True").lower() in ("1", "true", "yes")

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
