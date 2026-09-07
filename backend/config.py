"""Configuration management for the backend."""
from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    """Application settings."""

    # API settings
    API_HOST: str = "localhost"
    API_PORT: int = 8000
    API_RELOAD: bool = True

    # Database settings
    DATABASE_URL: str = "sqlite:///./linkfinder.db"

    # Ollama settings
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "phi3"

    # Embedding settings
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    EMBEDDING_DIMENSION: int = 384

    # Processing limits
    MAX_JOBS_PER_SCAN: int = 100
    MAX_POSTS_PER_SCAN: int = 100
    MAX_SCROLLS: int = 20
    MAX_SCAN_TIME_SECONDS: int = 60

    # Matching settings
    TOP_N_FOR_LLM: int = 10
    MIN_SIMILARITY_SCORE: float = 0.6

    # Ranking weights
    WEIGHT_ROLE: float = 0.25
    WEIGHT_SKILLS: float = 0.30
    WEIGHT_EXPERIENCE: float = 0.20
    WEIGHT_LOCATION: float = 0.10
    WEIGHT_FRESHNESS: float = 0.10
    WEIGHT_EMPLOYMENT: float = 0.05

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
