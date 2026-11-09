"""Logique applicative (indépendante de FastAPI, donc facile à tester)."""
from __future__ import annotations

import json
import time
from collections import Counter

from . import db
from .config import settings
from .extraction.document import parse_document
from .extraction.skills_extractor import extract_skills, get_matcher, get_taxonomy
from .generation.recommender import generate_recommendations
from .matching.embeddings import get_backend
from .matching.scorer import match_skills
from .pipeline import analyze
from .schemas import (
    AnalysisRecord, AnalysisResult, AnalysisSummary, CompareRequest, CompareResponse, DashboardStats,
    DictionaryEntry, ExtractRequest, ExtractResponse, MatchStatus, PasswordChange, Recommendations,
    ScorePoint, ScoringWeights, Skill, SkillCount, SkillType, StatusCounts, TokenOut, UserCreate,
    UserLogin, UserOut, UserUpdate,
)
from .security import create_access_token, hash_password, verify_password


class AuthError(ValueError):
    pass


class NotFoundError(LookupError):
    pass


# ---------------------------------------------------------------------------
# Comptes
# ---------------------------------------------------------------------------
def _user_out(row: dict) -> UserOut:
    return UserOut(**{k: row[k] for k in ("id", "email", "full_name", "role", "created_at")})


def register(data: UserCreate) -> TokenOut:
    row = db.create_user(data.email.strip(), data.full_name.strip(), data.role, hash_password(data.password))
    return TokenOut(access_token=create_access_token(row["id"]), user=_user_out(row))


def login(data: UserLogin) -> TokenOut:
    row = db.get_user_by_email(data.email.strip())
    if not row or not verify_password(data.password, row["password_hash"]):
        raise AuthError("E-mail ou mot de passe incorrect")
    return TokenOut(access_token=create_access_token(row["id"]), user=_user_out(row))


def get_user(user_id: int) -> UserOut:
    row = db.get_user(user_id)
    if not row:
        raise AuthError("Utilisateur introuvable")
    return _user_out(row)


def update_profile(user_id: int, data: UserUpdate) -> UserOut:
    return _user_out(db.update_user(user_id, full_name=data.full_name, role=data.role))


def change_password(user_id: int, data: PasswordChange) -> None:
    row = db.get_user(user_id)
    if not row or not verify_password(data.current_password, row["password_hash"]):
        raise AuthError("Mot de passe actuel incorrect")
    db.update_user(user_id, password_hash=hash_password(data.new_password))


# ---------------------------------------------------------------------------
# Analyses et historique
# ---------------------------------------------------------------------------
def _counts(result: AnalysisResult) -> StatusCounts:
    c = Counter(m.status for m in result.gap_analysis)
    return StatusCounts(couvert=c[MatchStatus.COUVERT], partiel=c[MatchStatus.PARTIEL], absent=c[MatchStatus.ABSENT])


def _summary(row: dict, result: AnalysisResult) -> AnalysisSummary:
    return AnalysisSummary(
        id=row["id"], title=row["title"], company=row["company"], cv_filename=row["cv_filename"],
        global_score=row["global_score"], counts=_counts(result),
        has_recommendations=bool(row.get("has_reco", row.get("reco_json"))), created_at=row["created_at"],
    )


def _record(row: dict) -> AnalysisRecord:
    result = AnalysisResult.model_validate_json(row["result_json"])
    reco = Recommendations.model_validate_json(row["reco_json"]) if row.get("reco_json") else None
    return AnalysisRecord(**_summary(row, result).model_dump(), result=result, recommendations=reco)


def _guess_title(job_text: str) -> str:
    for line in job_text.strip().splitlines():
        line = line.strip(" -:")
        if len(line) >= 4:
            return line[:90]
    return "Analyse sans titre"


def run_analysis(user_id: int, cv_text: str, job_text: str, weights: ScoringWeights,
                 title: str | None = None, company: str | None = None,
                 cv_filename: str | None = None) -> AnalysisRecord:
    result = analyze(cv_text, job_text, weights)
    analysis_id = db.save_analysis(
        user_id, (title or "").strip() or _guess_title(job_text), (company or "").strip() or None,
        cv_filename, result.global_score, json.loads(result.model_dump_json()),
    )
    return get_analysis(user_id, analysis_id)


def list_analyses(user_id: int) -> list[AnalysisSummary]:
    return [_summary(row, AnalysisResult.model_validate_json(row["result_json"])) for row in db.list_analyses(user_id)]


def get_analysis(user_id: int, analysis_id: int) -> AnalysisRecord:
    row = db.get_analysis(user_id, analysis_id)
    if not row:
        raise NotFoundError("Analyse introuvable")
    return _record(row)


def recommend(user_id: int, analysis_id: int, use_llm: bool = True) -> Recommendations:
    record = get_analysis(user_id, analysis_id)
    reco = generate_recommendations(record.result, use_llm=use_llm)
    db.save_recommendations(user_id, analysis_id, json.loads(reco.model_dump_json()))
    return reco


def delete_analysis(user_id: int, analysis_id: int) -> None:
    if not db.delete_analysis(user_id, analysis_id):
        raise NotFoundError("Analyse introuvable")


def dashboard_stats(user_id: int) -> DashboardStats:
    rows = db.list_analyses(user_id)
    results = [AnalysisResult.model_validate_json(r["result_json"]) for r in rows]
    scores = [r["global_score"] for r in rows]  # du plus récent au plus ancien

    totals = StatusCounts()
    missing: Counter[str] = Counter()
    for res in results:
        c = _counts(res)
        totals.couvert += c.couvert
        totals.partiel += c.partiel
        totals.absent += c.absent
        missing.update(m.required for m in res.gap_analysis if m.status == MatchStatus.ABSENT and not m.optional)

    history = [
        ScorePoint(id=r["id"], title=r["title"], score=r["global_score"], created_at=r["created_at"])
        for r in reversed(rows[:12])
    ]
    return DashboardStats(
        total_analyses=len(rows),
        average_score=round(sum(scores) / len(scores), 1) if scores else None,
        best_score=max(scores) if scores else None,
        last_score=scores[0] if scores else None,
        last_delta=round(scores[0] - scores[1], 1) if len(scores) > 1 else None,
        status_totals=totals,
        score_history=history,
        top_missing_skills=[SkillCount(name=n, count=c) for n, c in missing.most_common(8)],
    )


# ---------------------------------------------------------------------------
# Laboratoire NLP
# ---------------------------------------------------------------------------
def extract(req: ExtractRequest) -> ExtractResponse:
    t0 = time.perf_counter()
    document = parse_document(req.text, req.kind)
    return ExtractResponse(document=document, ner_engine=get_matcher().name,
                           duration_ms=round((time.perf_counter() - t0) * 1000, 1))


def _normalize_items(items: list[str]) -> list[Skill]:
    """« sklearn » -> scikit-learn (dictionnaire) ; un terme inconnu est gardé tel quel."""
    skills: dict[str, Skill] = {}
    for raw in items:
        raw = raw.strip()
        if not raw:
            continue
        hard, soft = extract_skills(raw)
        found = hard + soft
        skill = found[0] if found else Skill(name=raw, type=SkillType.HARD)
        skills.setdefault(skill.name, Skill(name=skill.name, type=skill.type, category=skill.category))
    return list(skills.values())


def compare(req: CompareRequest) -> CompareResponse:
    required, candidate = _normalize_items(req.required), _normalize_items(req.candidate)
    backend = get_backend()
    req_names, cand_names = [s.name for s in required], [s.name for s in candidate]
    matrix = backend.similarity(req_names, cand_names) if req_names and cand_names else []
    matches = match_skills(required, candidate, cv_sentences=[], backend=backend)
    return CompareResponse(
        required=req_names, candidate=cand_names,
        matrix=[[round(float(v), 3) for v in row] for row in matrix],
        matches=matches, embedding_backend=backend.name,
        thresholds={"couvert": settings.threshold_covered, "partiel": settings.threshold_partial},
    )


def dictionary() -> list[DictionaryEntry]:
    return [
        DictionaryEntry(name=e.name, type=e.type, category=e.category or "Soft skills",
                        aliases=e.aliases[1:], implies=e.implies)
        for e in get_taxonomy().entries.values()
    ]
