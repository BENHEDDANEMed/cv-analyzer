"""Module 3 (Phase « Guider ») : synthèse, reformulations et plan d'action (BF4).

1. On essaie le LLM avec un prompt contraint ; la réponse est validée par Pydantic.
2. Si la réponse est invalide, on redemande une fois en donnant l'erreur au modèle.
3. Si le LLM est indisponible, un générateur à base de règles produit des conseils simples,
   pour que l'application fonctionne toujours (démo, tests).
"""
from __future__ import annotations

import json
import logging

from pydantic import ValidationError

from ..schemas import (
    ActionItem, AnalysisResult, LLMRecommendations, MatchStatus, Recommendations, Reformulation,
)
from .llm_client import LLMUnavailableError, chat_json
from .prompts import SYSTEM_PROMPT, build_user_prompt, cv_excerpt_lines

logger = logging.getLogger(__name__)


def generate_recommendations(analysis: AnalysisResult, use_llm: bool = True) -> Recommendations:
    if use_llm:
        try:
            return _generate_with_llm(analysis)
        except (LLMUnavailableError, ValueError, ValidationError) as exc:
            logger.warning("Génération LLM impossible, repli sur les règles : %s", exc)
    return generate_rule_based(analysis)


def _generate_with_llm(analysis: AnalysisResult) -> Recommendations:
    messages = [{"role": "user", "content": build_user_prompt(analysis)}]
    last_error: Exception | None = None
    for _ in range(2):
        raw = chat_json(SYSTEM_PROMPT, messages)
        try:
            validated = LLMRecommendations.model_validate(raw)
            return Recommendations(**validated.model_dump(), source="llm")
        except ValidationError as exc:
            last_error = exc
            messages += [
                {"role": "assistant", "content": json.dumps(raw, ensure_ascii=False)},
                {"role": "user", "content": f"Le JSON ne respecte pas le format : {exc}. Corrige-le."},
            ]
    raise ValueError(f"Réponse LLM invalide après correction : {last_error}")


# ---------------------------------------------------------------------------
# Générateur de secours à base de règles
# ---------------------------------------------------------------------------
CATEGORY_ROADMAP: dict[str, tuple[str, str, str]] = {
    # catégorie : (type, action, durée)
    "IA": ("projet", "Réaliser un mini-projet public sur GitHub qui utilise {skill} sur un jeu de données réel", "2 à 3 semaines"),
    "Librairie IA": ("projet", "Reproduire un tutoriel officiel de {skill}, puis l'adapter à un cas personnel", "1 à 2 semaines"),
    "Librairie Data": ("formation", "Suivre un cours pratique sur {skill} et l'appliquer à un notebook d'analyse", "1 semaine"),
    "Cloud": ("certification", "Préparer une certification d'entrée de gamme sur {skill} (niveau fondamental)", "3 à 4 semaines"),
    "DevOps": ("projet", "Ajouter {skill} à un de vos projets existants (déploiement ou automatisation)", "1 semaine"),
    "Big Data": ("formation", "Suivre une formation pratique sur {skill} avec un cas de traitement de données", "2 semaines"),
    "Web / Backend": ("projet", "Exposer un de vos modèles sous forme d'API avec {skill}", "1 semaine"),
    "Base de données": ("formation", "Pratiquer {skill} sur une base d'exemple (requêtes, modélisation)", "1 semaine"),
}
DEFAULT_ROADMAP = ("ressource", "Étudier la documentation officielle de {skill} et l'utiliser dans un projet", "1 à 2 semaines")
SOFT_ROADMAP = ("ressource", "Mettre en avant « {skill} » avec un exemple concret (projet de groupe, association)", "—")


def generate_rule_based(analysis: AnalysisResult) -> Recommendations:
    from ..extraction.skills_extractor import get_taxonomy

    taxonomy = get_taxonomy()
    covered = [m for m in analysis.gap_analysis if m.status == MatchStatus.COUVERT]
    partial = [m for m in analysis.gap_analysis if m.status == MatchStatus.PARTIEL]
    absent = [m for m in analysis.gap_analysis if m.status == MatchStatus.ABSENT]
    # ordre de priorité : obligatoires absentes, obligatoires partielles, puis les souhaitées
    gaps = sorted(absent + partial, key=lambda m: (m.optional, m.status != MatchStatus.ABSENT))

    score = analysis.global_score
    level = "forte" if score >= 75 else "moyenne" if score >= 50 else "faible"
    synthese = (
        f"L'adéquation entre le CV et l'offre est {level} (score {int(score + 0.5)}/100). "
        f"{len(covered)} compétence(s) exigée(s) sont couvertes, {len(partial)} partiellement "
        f"et {len(absent)} absentes."
    )
    if covered:
        synthese += f" Les principaux atouts sont : {', '.join(m.required for m in covered[:4])}."
    mandatory_gaps = [m.required for m in gaps if not m.optional]
    if mandatory_gaps:
        synthese += f" Priorité : travailler {', '.join(mandatory_gaps[:3])}."

    forces = [f"{m.required} — {m.reason}" for m in covered[:6]]
    sub = analysis.sub_scores
    if sub.formation is not None and sub.formation >= 80:
        forces.append("Le niveau de diplôme correspond à l'offre")
    if not forces:
        forces = ["Le CV contient des éléments exploitables pour cette offre"]

    lacunes = [
        f"{m.required} ({'souhaitée' if m.optional else 'obligatoire'}, {m.status.value.lower()})"
        for m in gaps[:6]
    ]
    if analysis.job.years_experience and (analysis.cv.years_experience or 0) < analysis.job.years_experience:
        lacunes.append(
            f"Expérience : {analysis.cv.years_experience or 0} an(s) détecté(s) pour "
            f"{analysis.job.years_experience:g} exigé(s)"
        )

    # Reformulations : on reprend une phrase réelle du CV qui prouve une compétence COUVERTE,
    # mais qui n'utilise pas le mot-clé de l'offre (ex. « réseaux de neurones » -> « Deep Learning »).
    # On n'ajoute jamais une compétence que le candidat n'a pas.
    reformulations: list[Reformulation] = []
    excerpts = cv_excerpt_lines(analysis)
    contexts = {s.name: s.contexts for s in analysis.cv.hard_skills + analysis.cv.soft_skills}
    used_lines: set[str] = set()
    for m in covered:
        source_skill = m.matched_with or m.required
        for line in excerpts:
            in_context = any(line in c or c in line for c in contexts.get(source_skill, []))
            if in_context and line not in used_lines and m.required.lower() not in line.lower():
                used_lines.add(line)
                reformulations.append(Reformulation(
                    avant=line,
                    apres=f"{line.strip().rstrip('.')} — mot-clé de l'offre : {m.required}",
                    mots_cles=[m.required],
                ))
                break
        if len(reformulations) >= 3:
            break

    plan: list[ActionItem] = []
    for m in gaps[:6]:
        entry = taxonomy.entries.get(m.required)
        if m.type.value == "soft_skill":
            kind, action, duration = SOFT_ROADMAP
        else:
            kind, action, duration = CATEGORY_ROADMAP.get(entry.category if entry else "", DEFAULT_ROADMAP)
        plan.append(ActionItem(
            competence=m.required, type=kind, action=action.format(skill=m.required), duree_estimee=duration,
        ))

    return Recommendations(
        synthese=synthese, forces=forces, lacunes_prioritaires=lacunes,
        reformulations=reformulations, plan_action=plan, source="regles",
    )
