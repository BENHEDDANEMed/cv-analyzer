"""Prompt engineering contraint (Objectif 3) : le LLM ne reçoit que des faits vérifiés
issus des modules 1 et 2, et doit répondre dans un format JSON strict."""
from __future__ import annotations

import json

from ..schemas import AnalysisResult, MatchStatus, SectionName

SYSTEM_PROMPT = """Tu es un conseiller carrière spécialisé dans le recrutement technique (data, IA, logiciel).
Tu aides un candidat à améliorer son CV pour une offre précise.

RÈGLES STRICTES :
1. Utilise UNIQUEMENT les informations fournies dans le message (analyse, extraits du CV, offre).
2. N'invente JAMAIS d'expérience, de diplôme, d'entreprise ou de compétence que le candidat n'a pas.
3. Les reformulations partent d'une phrase RÉELLE du CV (champ "avant" copié tel quel) et
   n'ajoutent que des mots-clés de l'offre que le candidat maîtrise (compétences Couvert ou Partiel).
4. Le plan d'action ne concerne que les compétences Partiel ou Absent, en commençant par les obligatoires.
5. Ton constructif, phrases courtes, en français.
6. Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, avec exactement ces clés :
{
  "synthese": "3 à 5 phrases : adéquation globale, atouts principaux, manques prioritaires",
  "forces": ["atout 1", "atout 2", "..."],
  "lacunes_prioritaires": ["lacune 1", "..."],
  "reformulations": [{"avant": "phrase du CV", "apres": "phrase améliorée", "mots_cles": ["..."]}],
  "plan_action": [{"competence": "...", "type": "projet|certification|formation|ressource",
                   "action": "action concrète", "duree_estimee": "ex. 2 semaines"}]
}
Donne 2 à 4 reformulations et 3 à 6 actions."""


def _list(analysis: AnalysisResult, status: MatchStatus) -> list[str]:
    items = []
    for m in analysis.gap_analysis:
        if m.status == status:
            label = m.required + (" (souhaitée)" if m.optional else " (obligatoire)")
            if m.matched_with and status == MatchStatus.PARTIEL:
                label += f" — proche de : {m.matched_with}"
            items.append(label)
    return items


def cv_excerpt_lines(analysis: AnalysisResult, max_lines: int = 15) -> list[str]:
    """Phrases réelles du CV (expériences et projets) proposées au LLM pour les reformulations."""
    text = "\n".join(
        analysis.cv.sections.get(s, "") for s in (SectionName.EXPERIENCE, SectionName.PROJETS)
    )
    lines = [l.strip(" -") for l in text.split("\n") if len(l.strip()) > 25]
    return lines[:max_lines]


def build_user_prompt(analysis: AnalysisResult) -> str:
    facts = {
        "score_global_sur_100": analysis.global_score,
        "sous_scores": analysis.sub_scores.model_dump(),
        "competences_couvertes": _list(analysis, MatchStatus.COUVERT),
        "competences_partielles": _list(analysis, MatchStatus.PARTIEL),
        "competences_absentes": _list(analysis, MatchStatus.ABSENT),
        "annees_experience_cv": analysis.cv.years_experience,
        "annees_experience_exigees": analysis.job.years_experience,
        "diplomes_cv": [d.label for d in analysis.cv.degrees],
        "diplomes_exiges": [d.label for d in analysis.job.degrees],
    }
    return (
        "ANALYSE AUTOMATIQUE (faits vérifiés) :\n"
        + json.dumps(facts, ensure_ascii=False, indent=2)
        + "\n\nEXTRAITS RÉELS DU CV (à utiliser pour les reformulations) :\n"
        + "\n".join(f"- {l}" for l in cv_excerpt_lines(analysis))
        + "\n\nOFFRE D'EMPLOI :\n"
        + analysis.job.clean_text[:3000]
        + "\n\nProduis maintenant le JSON demandé."
    )
