import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

# Compute absolute path to backend/.env
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_ENV_FILE = os.path.join(_BACKEND_DIR, ".env")

class Settings(BaseSettings):
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    GEMINI_API_KEY: str = ""
    ENVIRONMENT: str = "development"
    PORT: int = 8000
    FRONTEND_URL: str = "http://localhost:3000"

    model_config = SettingsConfigDict(
        env_file=[_ENV_FILE, ".env"],
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

