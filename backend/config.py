"""Global configuration — environment variable based."""

import os
from pathlib import Path
from functools import lru_cache
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings


BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
CONFIG_DIR = DATA_DIR / "config"


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://postgres:postgres@localhost:5432/merkamail"
    db_pool_min: int = 2
    db_pool_max: int = 10

    # JWT
    jwt_access_secret: str = "change_this_access_secret_min_64_chars_xxxxxxxxxxxxxxxxxxxxxxxxxx"
    jwt_refresh_secret: str = "change_this_refresh_secret_min_64_chars_xxxxxxxxxxxxxxxxxxxxxxxxx"
    jwt_access_expires_minutes: int = 15
    jwt_refresh_days: int = 30

    # First admin seed
    admin_email: str = "admin@example.com"
    admin_password: str = "Admin123!"
    admin_name: str = "Admin"

    # App
    port: int = 8000
    debug: bool = False
    log_level: str = "warning"

    # CORS
    allowed_origins: str = "http://localhost:5173,http://localhost:4000"

    # AI
    gemini_api_key: str = ""
    groq_api_key: str = ""
    ollama_url: str = "http://localhost:11434"

    # Rate limiting
    rate_limit_login: str = "5/minute"
    rate_limit_api: str = "120/minute"
    rate_limit_scraping: str = "3/minute"

    class Config:
        env_file = str(BASE_DIR.parent / ".env")
        case_sensitive = False

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


# ── App settings stored in JSON (non-secret runtime config) ──────────────────

import json


class ApiKeysConfig(BaseModel):
    gemini_api_key: str = ""
    groq_api_key: str = ""
    ollama_url: str = "http://localhost:11434"


class ProcessingConfig(BaseModel):
    default_delay_ms: int = 3000
    default_concurrency: int = 3
    default_timeout_ms: int = 30000
    max_retries: int = 2
    playwright_timeout_ms: int = 60000
    contact_page_timeout_ms: int = 30000


class ProxyConfig(BaseModel):
    enabled: bool = False
    proxy_list: list[str] = Field(default_factory=list)
    rotation_strategy: str = "round_robin"


class AIClassificationConfig(BaseModel):
    enabled: bool = True
    provider_priority: list[str] = Field(default_factory=lambda: ["gemini", "groq", "ollama"])
    batch_size: int = 10
    max_html_context_chars: int = 500


class EmailDiscoveryConfig(BaseModel):
    smtp_timeout_seconds: int = 10
    max_patterns_per_name: int = 8
    verify_catch_all: bool = True


class LinkedInDorkingConfig(BaseModel):
    rate_limit_seconds: int = 5
    max_results_per_search: int = 20
    default_roles: list[str] = Field(
        default_factory=lambda: ["CEO", "Owner", "Founder", "Director", "Manager"]
    )


SETTINGS_PATH = CONFIG_DIR / "settings.json"


class AppSettings(BaseModel):
    version: str = "1.0.0"
    api_keys: ApiKeysConfig = Field(default_factory=ApiKeysConfig)
    processing: ProcessingConfig = Field(default_factory=ProcessingConfig)
    proxy: ProxyConfig = Field(default_factory=ProxyConfig)
    ai_classification: AIClassificationConfig = Field(default_factory=AIClassificationConfig)
    email_discovery: EmailDiscoveryConfig = Field(default_factory=EmailDiscoveryConfig)
    linkedin_dorking: LinkedInDorkingConfig = Field(default_factory=LinkedInDorkingConfig)

    @classmethod
    def load(cls) -> "AppSettings":
        if SETTINGS_PATH.exists():
            try:
                data = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
                return cls(**data)
            except Exception:
                return cls()
        return cls()

    def save(self) -> None:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        SETTINGS_PATH.write_text(self.model_dump_json(indent=2), encoding="utf-8")

    def update(self, **kwargs) -> None:
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)
        self.save()


_app_settings: AppSettings | None = None


def get_app_settings() -> AppSettings:
    global _app_settings
    if _app_settings is None:
        _app_settings = AppSettings.load()
    return _app_settings


def reload_app_settings() -> AppSettings:
    global _app_settings
    _app_settings = AppSettings.load()
    return _app_settings
