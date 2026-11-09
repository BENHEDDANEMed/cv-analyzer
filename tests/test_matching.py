"""Tests du Module 2 (appariement, score) et du Module 3 (recommandations par règles)."""
import pytest
from pydantic import ValidationError

from backend.app.generation.recommender import generate_rule_based
from backend.app.matching.embeddings import get_backend
from backend.app.matching.scorer import match_skills
from backend.app.pipeline import analyze
from backend.app.report import build_html_report
from backend.app.schemas import MatchStatus, ScoringWeights, Skill, SkillType


def _skills(*names):
    return [Skill(name=n, type=SkillType.HARD) for n in names]


def test_synonymy_via_taxonomy():
    """Problématique 1.2 : scikit-learn <-> Apprentissage supervisé, PyTorch <-> Deep Learning."""
    matches = match_skills(
        _skills("Apprentissage supervisé", "Deep Learning", "Kubernetes"),
        _skills("scikit-learn", "PyTorch"),
        cv_sentences=[], backend=get_backend(),
    )
    status = {m.required: m.status for m in matches}
    assert status["Apprentissage supervisé"] == MatchStatus.COUVERT
    assert status["Deep Learning"] == MatchStatus.COUVERT
    assert status["Kubernetes"] == MatchStatus.ABSENT


def test_partial_for_sibling_skills():
    matches = match_skills(_skills("AWS"), _skills("Azure"), cv_sentences=[], backend=get_backend())
    assert matches[0].status == MatchStatus.PARTIEL


def test_weights_must_sum_to_one():
    with pytest.raises(ValidationError):
        ScoringWeights(hard_skills=0.9, experience=0.5, formation=0.1, soft_skills=0.1)


def test_full_pipeline(cv_text, job_text):
    result = analyze(cv_text, job_text)
    assert 0 <= result.global_score <= 100
    assert result.gap_analysis
    assert {m.status for m in result.gap_analysis} >= {MatchStatus.COUVERT, MatchStatus.ABSENT}
    assert result.timings_ms["total"] < 5000  # BNF3


def test_weight_redistribution_when_criterion_missing(cv_text):
    job = "Nous cherchons un développeur Python et SQL pour notre équipe data. Missions : pipelines ETL."
    result = analyze(cv_text, job)
    assert result.sub_scores.formation is None
    assert any("formation" in n for n in result.not_evaluated)


def test_rule_based_recommendations_and_report(cv_text, job_text):
    result = analyze(cv_text, job_text)
    reco = generate_rule_based(result)
    assert reco.synthese and reco.plan_action
    absent_mandatory = {m.required for m in result.gap_analysis
                        if m.status == MatchStatus.ABSENT and not m.optional}
    assert absent_mandatory & {a.competence for a in reco.plan_action}
    html = build_html_report(result, reco)
    assert "Matrice des écarts" in html and "Feuille de route" in html
