"""Configuration centrale du backend (lue depuis les variables d'environnement / .env)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = Path(__file__).resolve().parent / "data"


def _load_dotenv(path: Path) -> None:
    """Petit lecteur de fichier .env (évite une dépendance supplémentaire)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(ROOT_DIR / ".env")


@dataclass(frozen=True)
class Settings:
    # Module 2 : embeddings
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    embedding_backend: str = os.getenv("EMBEDDING_BACKEND", "sentence-transformers")
    threshold_covered: float = float(os.getenv("THRESHOLD_COVERED", "0.80"))
    threshold_partial: float = float(os.getenv("THRESHOLD_PARTIAL", "0.55"))

    # Module 3 : LLM (API compatible OpenAI)
    llm_base_url: str = os.getenv("LLM_BASE_URL", "")
    llm_api_key: str = os.getenv("LLM_API_KEY", "")
    llm_model: str = os.getenv("LLM_MODEL", "")
    llm_temperature: float = float(os.getenv("LLM_TEMPERATURE", "0.2"))
    llm_timeout: float = float(os.getenv("LLM_TIMEOUT", "60"))

    # Ingestion
    max_upload_mb: int = int(os.getenv("MAX_UPLOAD_MB", "5"))

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm_base_url and self.llm_model)


settings = Settings()
