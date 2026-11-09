"""Les tests utilisent le backend TF-IDF : rapides, hors-ligne, déterministes.
Les règles testées (dictionnaire, implications, score) ne dépendent pas du modèle d'embeddings."""
import os
from pathlib import Path

import pytest

os.environ.setdefault("EMBEDDING_BACKEND", "tfidf")

SAMPLES = Path(__file__).resolve().parents[1] / "data" / "samples"


@pytest.fixture(scope="session")
def cv_text() -> str:
    return (SAMPLES / "cv_exemple.txt").read_text(encoding="utf-8")


@pytest.fixture(scope="session")
def job_text() -> str:
    return (SAMPLES / "offre_exemple.txt").read_text(encoding="utf-8")
