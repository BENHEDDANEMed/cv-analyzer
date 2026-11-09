"""Vectorisation par embeddings (BF3) et similarité cosinus.

Backend principal : Sentence-Transformers `all-MiniLM-L6-v2` (vecteurs denses de 384 dimensions).
Backend de secours : TF-IDF sur n-grammes de caractères (fonctionne hors-ligne, sans modèle),
utile pour les tests ou si le modèle ne peut pas être téléchargé.
"""
from __future__ import annotations

import logging
import threading
from typing import Protocol

import numpy as np

from ..config import settings

logger = logging.getLogger(__name__)


class SimilarityBackend(Protocol):
    name: str
    # Plage utile des similarités : sert à ramener un cosinus « brut » sur une échelle 0-1.
    scale_low: float
    scale_high: float

    def similarity(self, a: list[str], b: list[str]) -> np.ndarray:
        """Matrice (len(a), len(b)) de similarités cosinus dans [0, 1]."""


class SentenceTransformerBackend:
    scale_low, scale_high = 0.15, 0.65

    def __init__(self, model_name: str):
        from sentence_transformers import SentenceTransformer

        self.model = SentenceTransformer(model_name, device="cpu")
        self.name = model_name.split("/")[-1]
        self._cache: dict[str, np.ndarray] = {}
        self._lock = threading.Lock()

    def encode(self, texts: list[str]) -> np.ndarray:
        missing = [t for t in dict.fromkeys(texts) if t not in self._cache]
        if missing:
            vectors = self.model.encode(
                missing, batch_size=64, normalize_embeddings=True, convert_to_numpy=True,
                show_progress_bar=False,
            )
            with self._lock:
                if len(self._cache) > 20_000:  # cache simple, vidé s'il devient trop grand
                    self._cache.clear()
                self._cache.update(zip(missing, vectors))
        return np.vstack([self._cache[t] for t in texts])

    def similarity(self, a: list[str], b: list[str]) -> np.ndarray:
        if not a or not b:
            return np.zeros((len(a), len(b)))
        # vecteurs normalisés : produit scalaire = similarité cosinus
        return np.clip(self.encode(a) @ self.encode(b).T, 0.0, 1.0)


class TfidfBackend:
    name = "tfidf-char-ngrams (secours)"
    scale_low, scale_high = 0.05, 0.45

    def similarity(self, a: list[str], b: list[str]) -> np.ndarray:
        if not a or not b:
            return np.zeros((len(a), len(b)))
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity

        vectorizer = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), strip_accents="unicode")
        matrix = vectorizer.fit_transform(a + b)
        return np.clip(cosine_similarity(matrix[: len(a)], matrix[len(a):]), 0.0, 1.0)


_backend: SimilarityBackend | None = None
_backend_lock = threading.Lock()


def get_backend() -> SimilarityBackend:
    """Charge le modèle une seule fois (au démarrage de l'API) puis le réutilise."""
    global _backend
    with _backend_lock:
        if _backend is None:
            if settings.embedding_backend == "tfidf":
                _backend = TfidfBackend()
            else:
                try:
                    _backend = SentenceTransformerBackend(settings.embedding_model)
                except Exception as exc:
                    logger.warning("Modèle d'embeddings indisponible (%s) : secours TF-IDF.", exc)
                    _backend = TfidfBackend()
        return _backend


def scale(backend: SimilarityBackend, value: float) -> float:
    """Ramène une similarité brute sur [0, 1] selon la plage utile du backend."""
    span = backend.scale_high - backend.scale_low
    return float(np.clip((value - backend.scale_low) / span, 0.0, 1.0))
