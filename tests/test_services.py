"""Tests de l'authentification, de l'historique et du laboratoire (sans serveur HTTP)."""
import pytest

from backend.app import db, services
from backend.app.schemas import (
    CompareRequest, ExtractRequest, MatchStatus, PasswordChange, ScoringWeights, UserCreate, UserLogin,
)
from backend.app.security import InvalidTokenError, create_access_token, decode_access_token


@pytest.fixture()
def user(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")
    db.init_db()
    return services.register(UserCreate(email="Sara@Test.ma", full_name="Sara", password="motdepasse1"))


def test_register_and_login(user):
    assert user.user.email == "sara@test.ma"
    token = services.login(UserLogin(email="sara@test.ma", password="motdepasse1"))
    assert decode_access_token(token.access_token) == user.user.id
    with pytest.raises(services.AuthError):
        services.login(UserLogin(email="sara@test.ma", password="mauvais"))
    with pytest.raises(db.EmailAlreadyUsedError):
        services.register(UserCreate(email="sara@test.ma", full_name="Autre", password="motdepasse2"))


def test_token_tampering_and_expiry():
    token = create_access_token(1)
    with pytest.raises(InvalidTokenError):
        decode_access_token(token[:-2] + "xx")
    with pytest.raises(InvalidTokenError):
        decode_access_token(create_access_token(1, ttl=-10))


def test_password_change(user):
    uid = user.user.id
    with pytest.raises(services.AuthError):
        services.change_password(uid, PasswordChange(current_password="faux", new_password="nouveau123"))
    services.change_password(uid, PasswordChange(current_password="motdepasse1", new_password="nouveau123"))
    services.login(UserLogin(email="sara@test.ma", password="nouveau123"))


def test_history_stats_and_isolation(user, cv_text, job_text):
    uid = user.user.id
    rec = services.run_analysis(uid, cv_text, job_text, ScoringWeights(), company="ACME")
    assert rec.title.startswith("Offre de stage")
    services.run_analysis(uid, cv_text, job_text, ScoringWeights())
    reco = services.recommend(uid, rec.id, use_llm=False)
    assert services.get_analysis(uid, rec.id).recommendations == reco

    stats = services.dashboard_stats(uid)
    assert stats.total_analyses == 2 and stats.last_delta == 0
    assert stats.top_missing_skills and len(stats.score_history) == 2

    other = services.register(UserCreate(email="autre@test.ma", full_name="Autre", password="motdepasse1"))
    with pytest.raises(services.NotFoundError):
        services.get_analysis(other.user.id, rec.id)  # un utilisateur ne voit pas les analyses des autres
    services.delete_analysis(uid, rec.id)
    assert len(services.list_analyses(uid)) == 1


def test_lab_compare_normalizes_and_matches():
    res = services.compare(CompareRequest(required=["Deep Learning", "aws"], candidate=["pytorch", "Azure"]))
    assert res.required == ["Deep Learning", "AWS"] and res.candidate == ["PyTorch", "Azure"]
    status = {m.required: m.status for m in res.matches}
    assert status == {"Deep Learning": MatchStatus.COUVERT, "AWS": MatchStatus.PARTIEL}
    assert len(res.matrix) == 2 and len(res.matrix[0]) == 2


def test_lab_extract_and_dictionary():
    res = services.extract(ExtractRequest(text="Développeur Python, sklearn et Docker. Autonome.", kind="cv"))
    assert {"Python", "scikit-learn", "Docker"} <= {s.name for s in res.document.hard_skills}
    assert any(e.name == "PyTorch" and "Deep Learning" in e.implies for e in services.dictionary())
