"""Segmentation structurelle (BF1) : découpe le texte en sections sémantiques."""
from __future__ import annotations

import re

from ..schemas import SectionName
from .cleaner import strip_accents

# Mots-clés de titres de section (FR + EN, sans accents, en minuscules).
SECTION_KEYWORDS: dict[SectionName, list[str]] = {
    SectionName.EXPERIENCE: [
        "experiences professionnelles", "experience professionnelle", "experiences", "experience",
        "parcours professionnel", "work experience", "professional experience", "employment",
        "stages", "stage", "emplois",
    ],
    SectionName.FORMATION: [
        "formations", "formation", "education", "cursus", "parcours academique", "diplomes",
        "diplome", "etudes", "academic background",
    ],
    SectionName.COMPETENCES: [
        "competences techniques", "competences", "skills", "technical skills", "boite a outils",
        "outils", "technologies", "hard skills", "soft skills", "savoir-faire", "langues",
        "qualites", "atouts",
    ],
    SectionName.PROJETS: [
        "projets academiques", "projets personnels", "projets", "projects", "realisations",
        "portfolio",
    ],
    SectionName.PROFIL: [
        "profil", "resume", "summary", "a propos", "about me", "objectif", "presentation",
    ],
    SectionName.AUTRE: [
        "centres d'interet", "loisirs", "interests", "hobbies", "certifications", "references",
        "activites associatives", "vie associative",
    ],
}

_HEADER_CLEAN = re.compile(r"[^a-z' &/-]")


def _match_header(line: str) -> SectionName | None:
    """Retourne la section si la ligne ressemble à un titre de section."""
    stripped = line.strip().strip(":").strip()
    if not stripped or len(stripped) > 45 or len(stripped.split()) > 5:
        return None
    if stripped.startswith("- "):
        return None
    if re.search(r"\d", stripped):  # "Stage 2023", "Master 2" : ce sont des contenus, pas des titres
        return None
    normalized = _HEADER_CLEAN.sub("", strip_accents(stripped).lower()).strip()
    looks_like_title = stripped.isupper() or line.strip().endswith(":")
    for section, keywords in SECTION_KEYWORDS.items():
        for keyword in keywords:
            if normalized == keyword:
                return section
            # "Compétences techniques & outils" : accepté si le mot-clé est précis
            # ou si la ligne a la forme d'un titre (MAJUSCULES ou ":" final).
            if normalized.startswith(keyword + " ") and (" " in keyword or looks_like_title):
                return section
    return None


def segment(text: str) -> dict[SectionName, str]:
    """Découpe le texte nettoyé. Le texte avant le premier titre va dans « profil »."""
    sections: dict[SectionName, list[str]] = {s: [] for s in SectionName}
    current = SectionName.PROFIL
    for line in text.split("\n"):
        header = _match_header(line)
        if header is not None:
            current = header
            continue
        sections[current].append(line)
    return {s: "\n".join(lines).strip() for s, lines in sections.items() if "".join(lines).strip()}
