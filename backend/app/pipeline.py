"""Orchestration du pipeline : Extraire -> Évaluer (-> Guider, appelé séparément)."""
from __future__ import annotations

import time

from .extraction.document import parse_document
from .matching.embeddings import get_backend
from .matching.scorer import compute_scores
from .schemas import AnalysisResult, ScoringWeights


def analyze(cv_text: str, job_text: str, weights: ScoringWeights | None = None) -> AnalysisResult:
    weights = weights or ScoringWeights()
    timings: dict[str, float] = {}
    t0 = time.perf_counter()

    cv = parse_document(cv_text, "cv")
    timings["extraction_cv"] = (time.perf_counter() - t0) * 1000

    t1 = time.perf_counter()
    job = parse_document(job_text, "offre")
    timings["extraction_offre"] = (time.perf_counter() - t1) * 1000

    t2 = time.perf_counter()
    backend = get_backend()
    global_score, sub_scores, gap, not_evaluated = compute_scores(cv, job, weights, backend)
    timings["appariement_et_score"] = (time.perf_counter() - t2) * 1000
    timings["total"] = (time.perf_counter() - t0) * 1000

    return AnalysisResult(
        global_score=global_score,
        sub_scores=sub_scores,
        weights=weights,
        gap_analysis=gap,
        not_evaluated=not_evaluated,
        cv=cv,
        job=job,
        embedding_backend=backend.name,
        timings_ms={k: round(v, 1) for k, v in timings.items()},
    )
