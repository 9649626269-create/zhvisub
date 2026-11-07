"""Application configuration loaded from environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Whisper ASR
    whisper_model: str = "large-v3"
    whisper_compute: str = "int8"

    # OCR
    ocr_fps: int = 2
    ocr_bottom_ratio: float = 0.35

    # Translation
    llm_base_url: str = "http://localhost:11434/v1"
    llm_api_key: str = ""
    llm_model: str = "qwen2.5:7b"
    translate_fallback: str = "nllb"  # nllb | google

    # TTS / Dubbing
    tts_provider: str = "edge"  # edge | piper
    tts_voice: str = "vi-VN-HoaiMyNeural"
    dub_max_spill_ms: int = 400
    dub_max_speedup: float = 1.3
    dub_concurrency: int = 4

    # Storage
    data_dir: Path = Path("./data")
    models_dir: Path = Path("./models")

    # Cleanup
    retention_hours: int = 24
    max_upload_gb: float = 2.0
    max_concurrent_jobs: int = 3

    # Server
    cors_origins: str = "http://localhost:3000,capacitor://localhost"
    database_url: str = "sqlite:///./data/db/zhvisub.db"
    redis_url: str = "redis://localhost:6379/0"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def get_job_dir(self, job_id: str) -> Path:
        """Return the directory for a specific job."""
        d = self.data_dir / "jobs" / job_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def ensure_dirs(self) -> None:
        """Create necessary directories."""
        (self.data_dir / "jobs").mkdir(parents=True, exist_ok=True)
        (self.data_dir / "db").mkdir(parents=True, exist_ok=True)
        self.models_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
