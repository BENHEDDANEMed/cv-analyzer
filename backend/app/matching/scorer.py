"""Module 2 (Phase « Évaluer ») : gap analysis et score composite sur 100 (BF3).

Score global = 0.50 x S_hard + 0.25 x S_experience + 0.15 x S_formation + 0.10 x S_soft
(poids paramétrables). Si l'offre ne dit rien sur un critère, ce critère n'est pas évalué
et son poids est redistribué sur les autres.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

import numpy as np

from ..config import settings
from ..extraction.skills_extractor import DEGREE_PATTERNS, SkillTaxonomy, get_taxonomy
from ..extraction.cleaner import strip_accents
from ..schemas import (
    MatchStatus, ParsedDocument, ScoringWeights, SectionName, Skill, SkillMatch, SubScores,
)
from .embeddings import SimilarityBackend, scale

STATUS_VALUE = {MatchStatus.COUVERT: 1.0, MatchStatus.PARTIEL: 0.5, MatchStatus.ABSENT: 0.0}
OPTIONAL_WEIGHT = 0.5  # une compétence « souhaitée » compte deux fois moins qu'une obligatoire
# Parents trop généraux pour conclure à une « notion connexe » (Pandas et Django impliquent Python...).
GENERIC_PARENTS = {"Python", "Data Science"}


def split_sentences(text: str, max_sentences: int = 80) -> list[str]:
    parts = re.split(r"\n+|(?<=[.;!?])\s+", text)
    sentences = [p.strip(" -\t") for p in parts]
    return [s for s in sentences if len(s) >= 15][:max_sentences]


# ---------------------------------------------------------------------------
# Gap analysis compétence par compétence
# ---------------------------------------------------------------------------
@dataclass
class _Candidate:
    status: MatchStatus
    similarity: float
    matched_with: str | None
    reason: str


def _rule_based_match(required: Skill, cv_names: set[str], taxonomy: SkillTaxonomy) -> _Candidate | None:
    name = required.name
    if name in cv_names:
        return _Candidate(MatchStatus.COUVERT, 1.0, name, "Mentionnée explicitement dans le CV")

    # 1) une compétence du CV implique la compétence exigée (PyTorch -> Deep Learning)
    for cv_skill in sorted(cv_names):
        if name in taxonomy.implied_by(cv_skill):
            return _Candidate(
                MatchStatus.COUVERT, 0.9, cv_skill,
                f"Déduite de « {cv_skill} » ({cv_skill} implique {name})",
            )

    # 2) le CV contient la notion directement plus générale, ou une compétence « sœur »
    #    (même parent direct). On reste à un seul niveau pour ne pas être trop généreux.
    def direct_parents(skill: str) -> set[str]:
        entry = taxonomy.entries.get(skill)
        return (set(entry.implies) if entry else set()) - GENERIC_PARENTS

    parents = direct_parents(name)
    for cv_skill in sorted(cv_names):
        if cv_skill in parents:
            return _Candidate(
                MatchStatus.PARTIEL, 0.6, cv_skill,
                f"Le CV mentionne « {cv_skill} », notion plus générale",
            )
    for cv_skill in sorted(cv_names):
        shared = direct_parents(cv_skill) & parents
        if shared:
            return _Candidate(
                MatchStatus.PARTIEL, 0.6, cv_skill,
                f"Notion connexe : « {cv_skill} » (même famille : {', '.join(sorted(shared))})",
            )
    return None


def match_skills(
    required: list[Skill],
    cv_skills: list[Skill],
    cv_sentences: list[str],
    backend: SimilarityBackend,
    taxonomy: SkillTaxonomy | None = None,
) -> list[SkillMatch]:
    taxonomy = taxonomy or get_taxonomy()
    cv_names = {s.name for s in cv_skills}
    t_cov, t_par = settings.threshold_covered, settings.threshold_partial

    results: dict[str, _Candidate] = {}
    remaining: list[Skill] = []
    for skill in required:
        candidate = _rule_based_match(skill, cv_names, taxonomy)
        if candidate:
            results[skill.name] = candidate
        else:
            remaining.append(skill)

    # Appariement sémantique pour ce que le dictionnaire ne relie pas (BF3).
    if remaining:
        names = [s.name for s in remaining]
        cv_list = sorted(cv_names)
        sim_skills = backend.similarity(names, cv_list) if cv_list else np.zeros((len(names), 0))
        sim_sents = backend.similarity(names, cv_sentences) if cv_sentences else np.zeros((len(names), 0))
        for i, skill in enumerate(remaining):
            best_skill = float(sim_skills[i].max()) if sim_skills.shape[1] else 0.0
            best_sent = float(sim_sents[i].max()) if sim_sents.shape[1] else 0.0
            if best_skill >= t_cov:
                other = cv_list[int(sim_skills[i].argmax())]
                results[skill.name] = _Candidate(MatchStatus.COUVERT, best_skill, other,
                                                 f"Équivalent sémantique : « {other} »")
            elif best_skill >= t_par:
                other = cv_list[int(sim_skills[i].argmax())]
                results[skill.name] = _Candidate(MatchStatus.PARTIEL, best_skill, other,
                                                 f"Proche sémantiquement de « {other} »")
            elif best_sent >= t_par + 0.05:
                sentence = cv_sentences[int(sim_sents[i].argmax())]
                results[skill.name] = _Candidate(MatchStatus.PARTIEL, best_sent, sentence[:80],
                                                 "Évoquée indirectement dans le CV")
            else:
                results[skill.name] = _Candidate(MatchStatus.ABSENT, max(best_skill, best_sent), None,
                                                 "Non trouvée dans le CV")

    matches = []
    for skill in required:
        c = results[skill.name]
        matches.append(SkillMatch(
            required=skill.name, type=skill.type, optional=skill.optional, status=c.status,
            similarity=round(min(max(c.similarity, 0.0), 1.0), 3), matched_with=c.matched_with,
            reason=c.reason,
        ))
    return matches


def coverage_score(matches: list[SkillMatch]) -> float | None:
    if not matches:
        return None
    weights = [OPTIONAL_WEIGHT if m.optional else 1.0 for m in matches]
    values = [STATUS_VALUE[m.status] for m in matches]
    return round(100 * float(np.dot(weights, values)) / sum(weights), 1)


# ---------------------------------------------------------------------------
# Sous-scores expérience et formation
# ---------------------------------------------------------------------------
def semantic_coverage(backend: SimilarityBackend, job_sentences: list[str], cv_sentences: list[str]) -> float:
    """Pour chaque phrase de l'offre, on garde la phrase du CV la plus proche, puis on fait la moyenne."""
    if not job_sentences or not cv_sentences:
        return 0.0
    sims = backend.similarity(job_sentences, cv_sentences)
    return scale(backend, float(sims.max(axis=1).mean()))


def experience_score(cv: ParsedDocument, job: ParsedDocument, backend: SimilarityBackend) -> float:
    cv_text = "\n".join(
        cv.sections.get(s, "") for s in (SectionName.EXPERIENCE, SectionName.PROJETS)
    ).strip() or cv.clean_text
    semantic = semantic_coverage(backend, split_sentences(job.clean_text), split_sentences(cv_text))
    if job.years_experience:
        ratio = min((cv.years_experience or 0.0) / job.years_experience, 1.0)
        return round(100 * (0.6 * ratio + 0.4 * semantic), 1)
    return round(100 * semantic, 1)


def formation_score(cv: ParsedDocument, job: ParsedDocument, backend: SimilarityBackend) -> float | None:
    if not job.degrees:
        return None  # l'offre n'exige aucun diplôme : critère non évalué
    required_level = min(d.level for d in job.degrees)
    cv_level = max((d.level for d in cv.degrees), default=None)
    if cv_level is None:
        level_score = 0.2
    elif cv_level >= required_level:
        level_score = 1.0
    else:
        level_score = max(0.0, 1.0 - 0.25 * (required_level - cv_level))

    # Domaine du diplôme : lignes de l'offre qui parlent de diplôme vs section formation du CV.
    degree_lines = [
        line for line in job.clean_text.split("\n")
        if any(p.search(strip_accents(line).lower()) for _, _, p in DEGREE_PATTERNS)
    ]
    formation_text = cv.sections.get(SectionName.FORMATION, "")
    if degree_lines and formation_text:
        field = semantic_coverage(backend, degree_lines, split_sentences(formation_text) or [formation_text])
        return round(100 * (0.8 * level_score + 0.2 * field), 1)
    return round(100 * level_score, 1)


# ---------------------------------------------------------------------------
# Score global
# ---------------------------------------------------------------------------
def compute_scores(
    cv: ParsedDocument, job: ParsedDocument, weights: ScoringWeights, backend: SimilarityBackend,
) -> tuple[float, SubScores, list[SkillMatch], list[str]]:
    cv_sentences = split_sentences(cv.clean_text, max_sentences=120)

    hard_matches = match_skills(job.hard_skills, cv.hard_skills, cv_sentences, backend)
    soft_matches = match_skills(job.soft_skills, cv.soft_skills, cv_sentences, backend)

    hard = coverage_score(hard_matches)
    not_evaluated: list[str] = []
    if hard is None:  # aucune compétence reconnue dans l'offre : similarité globale
        hard = round(100 * semantic_coverage(
            backend, split_sentences(job.clean_text), cv_sentences), 1)
        not_evaluated.append("hard_skills (aucune compétence du dictionnaire dans l'offre : similarité globale utilisée)")

    sub = SubScores(
        hard_skills=hard,
        experience=experience_score(cv, job, backend),
        formation=formation_score(cv, job, backend),
        soft_skills=coverage_score(soft_matches),
    )

    pairs = [
        ("hard_skills", weights.hard_skills, sub.hard_skills),
        ("experience", weights.experience, sub.experience),
        ("formation", weights.formation, sub.formation),
        ("soft_skills", weights.soft_skills, sub.soft_skills),
    ]
    for name, _, value in pairs:
        if value is None:
            not_evaluated.append(f"{name} (non exigé par l'offre : poids redistribué)")
    available = [(w, v) for _, w, v in pairs if v is not None and w > 0]
    total_weight = sum(w for w, _ in available)
    global_score = round(sum(w * v for w, v in available) / total_weight, 1) if total_weight else 0.0

    return global_score, sub, hard_matches + soft_matches, not_evaluated
