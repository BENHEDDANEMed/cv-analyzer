"""Extraction d'entités (BF2) : hard skills, soft skills, diplômes, durées d'expérience.

Approche : NER à base de règles avec spaCy (EntityRuler) alimenté par un dictionnaire
technologique. Chaque entité trouvée est normalisée vers son nom canonique
(ex. « sklearn », « scikit learn » -> « scikit-learn »).
Si spaCy n'est pas installé, un moteur regex équivalent prend le relais.
"""
from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass, field
from datetime import date
from functools import lru_cache
from pathlib import Path

from ..config import DATA_DIR
from ..schemas import Degree, Skill, SkillType
from .cleaner import strip_accents

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Dictionnaire / taxonomie
# ---------------------------------------------------------------------------
@dataclass
class SkillEntry:
    name: str
    type: SkillType
    category: str | None
    aliases: list[str]
    implies: list[str] = field(default_factory=list)
    case_sensitive: bool = False


class SkillTaxonomy:
    """Dictionnaire des compétences + relations « implique » (ex. PyTorch -> Deep Learning)."""

    def __init__(self, path: Path):
        data = json.loads(path.read_text(encoding="utf-8"))
        self.entries: dict[str, SkillEntry] = {}
        for raw, skill_type in ((data["hard_skills"], SkillType.HARD), (data["soft_skills"], SkillType.SOFT)):
            for item in raw:
                aliases = list(dict.fromkeys([item["name"], *item.get("aliases", [])]))
                self.entries[item["name"]] = SkillEntry(
                    name=item["name"],
                    type=skill_type,
                    category=item.get("category"),
                    aliases=aliases,
                    implies=item.get("implies", []),
                    case_sensitive=item.get("case_sensitive", False),
                )

    def implied_by(self, name: str) -> set[str]:
        """Toutes les compétences plus générales déduites de `name` (fermeture transitive)."""
        result: set[str] = set()
        stack = list(self.entries[name].implies) if name in self.entries else []
        while stack:
            parent = stack.pop()
            if parent not in result:
                result.add(parent)
                if parent in self.entries:
                    stack.extend(self.entries[parent].implies)
        return result


@lru_cache(maxsize=1)
def get_taxonomy() -> SkillTaxonomy:
    return SkillTaxonomy(DATA_DIR / "skills_dictionary.json")


# ---------------------------------------------------------------------------
# Moteurs de reconnaissance (spaCy ou regex)
# ---------------------------------------------------------------------------
@dataclass
class EntityHit:
    name: str      # nom canonique
    start: int     # position dans le texte
    end: int


class RegexSkillMatcher:
    """Moteur de secours : une expression régulière par compétence."""

    name = "regex"

    def __init__(self, taxonomy: SkillTaxonomy):
        self.patterns: list[tuple[str, re.Pattern]] = []
        for entry in taxonomy.entries.values():
            aliases = sorted({strip_accents(a) for a in entry.aliases}, key=len, reverse=True)
            body = "|".join(re.escape(a) for a in aliases)
            flags = 0 if entry.case_sensitive else re.IGNORECASE
            # pas de lettre/chiffre collé avant ou après (évite "java" dans "javascript")
            pattern = re.compile(rf"(?<![\w\-./])(?:{body})(?![\w+#'&])", flags)
            self.patterns.append((entry.name, pattern))

    def find(self, folded_text: str) -> list[EntityHit]:
        hits = []
        for name, pattern in self.patterns:
            for m in pattern.finditer(folded_text):
                hits.append(EntityHit(name, m.start(), m.end()))
        return hits


class SpacySkillMatcher:
    """NER à base de règles : spaCy EntityRuler (labels HARD_SKILL / SOFT_SKILL)."""

    name = "spacy-entity-ruler"

    def __init__(self, taxonomy: SkillTaxonomy):
        import spacy

        self.nlp = spacy.blank("xx")  # tokenizer multilingue, sans téléchargement de modèle
        ruler = self.nlp.add_pipe("entity_ruler", config={"phrase_matcher_attr": "LOWER"})
        patterns = []
        for entry in taxonomy.entries.values():
            label = "HARD_SKILL" if entry.type == SkillType.HARD else "SOFT_SKILL"
            for alias in entry.aliases:
                folded = strip_accents(alias)
                if entry.case_sensitive:
                    tokens = [{"ORTH": t.text} for t in self.nlp.make_doc(folded)]
                    patterns.append({"label": label, "pattern": tokens, "id": entry.name})
                else:
                    patterns.append({"label": label, "pattern": folded.lower(), "id": entry.name})
        ruler.add_patterns(patterns)

    def find(self, folded_text: str) -> list[EntityHit]:
        doc = self.nlp(folded_text)
        return [EntityHit(ent.ent_id_, ent.start_char, ent.end_char) for ent in doc.ents if ent.ent_id_]


@lru_cache(maxsize=1)
def get_matcher():
    taxonomy = get_taxonomy()
    if os.getenv("SKILL_MATCHER", "spacy") != "regex":
        try:
            return SpacySkillMatcher(taxonomy)
        except Exception as exc:  # spaCy absent ou erreur de configuration
            logger.warning("spaCy indisponible (%s) : utilisation du moteur regex.", exc)
    return RegexSkillMatcher(taxonomy)


# ---------------------------------------------------------------------------
# Compétences « souhaitées » vs « obligatoires » (offres d'emploi)
# ---------------------------------------------------------------------------
OPTIONAL_MARKERS = (
    "souhait", "apprecie", "un plus", "est un atout", "serait un atout", "nice to have",
    "idealement", "optionnel", "bonus", "would be a plus", "is a plus", "preferred",
)


def optional_line_flags(lines: list[str]) -> list[bool]:
    """Pour chaque ligne : True si elle décrit une exigence facultative."""
    flags: list[bool] = []
    in_optional_block = False
    for line in lines:
        folded = strip_accents(line).lower().strip()
        has_marker = any(m in folded for m in OPTIONAL_MARKERS)
        is_block_title = folded.endswith(":") or (0 < len(folded) < 40 and not folded.startswith("- "))
        if is_block_title:
            in_optional_block = has_marker
        flags.append(has_marker or in_optional_block)
    return flags


# ---------------------------------------------------------------------------
# Extraction des compétences
# ---------------------------------------------------------------------------
def extract_skills(text: str, detect_optional: bool = False) -> tuple[list[Skill], list[Skill]]:
    """Retourne (hard_skills, soft_skills) normalisés, triés par nombre de mentions."""
    taxonomy = get_taxonomy()
    folded = strip_accents(text)
    same_length = len(folded) == len(text)
    lines = text.split("\n")
    line_starts = [0]
    for line in lines[:-1]:
        line_starts.append(line_starts[-1] + len(line) + 1)
    optional_flags = optional_line_flags(lines) if detect_optional else [False] * len(lines)

    def line_index(pos: int) -> int:
        lo, hi = 0, len(line_starts) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if line_starts[mid] <= pos:
                lo = mid
            else:
                hi = mid - 1
        return lo

    found: dict[str, dict] = {}
    for hit in get_matcher().find(folded):
        surface = (text if same_length else folded)[hit.start:hit.end]
        idx = line_index(hit.start)
        item = found.setdefault(hit.name, {"mentions": [], "lines": []})
        if surface not in item["mentions"]:
            item["mentions"].append(surface)
        if idx not in item["lines"]:
            item["lines"].append(idx)

    hard, soft = [], []
    for name, item in found.items():
        entry = taxonomy.entries[name]
        skill = Skill(
            name=name,
            type=entry.type,
            category=entry.category,
            mentions=item["mentions"],
            contexts=[lines[i].strip()[:200] for i in item["lines"][:3]],
            optional=detect_optional and all(optional_flags[i] for i in item["lines"]),
        )
        (hard if entry.type == SkillType.HARD else soft).append(skill)

    key = lambda s: (-len(s.contexts), s.name.lower())
    return sorted(hard, key=key), sorted(soft, key=key)


# ---------------------------------------------------------------------------
# Diplômes
# ---------------------------------------------------------------------------
DEGREE_PATTERNS: list[tuple[int, str, re.Pattern]] = [
    (8, "Doctorat", re.compile(r"\b(doctorat|ph\.?\s?d|these de doctorat)\b")),
    (5, "Bac+5 (Master / Ingénieur)", re.compile(
        r"\b(master|mastere|msc|m2|bac\s*\+\s*5|diplome d'ingenieurs?|cycle (d')?ingenieurs?|"
        r"ecole d'ingenieurs?|ingenieur d'etat|mba)\b")),
    (3, "Bac+3 (Licence / Bachelor)", re.compile(r"\b(licence|bachelor|bsc|bac\s*\+\s*3)\b")),
    (2, "Bac+2 (DUT / BTS)", re.compile(r"\b(dut|bts|deug|deust|bac\s*\+\s*2|technicien specialise)\b")),
    (0, "Baccalauréat", re.compile(r"\b(baccalaureat|bac)\b(?!\s*\+)")),
]


def extract_degrees(text: str) -> list[Degree]:
    folded = strip_accents(text).lower()
    degrees = []
    for level, label, pattern in DEGREE_PATTERNS:
        if pattern.search(folded):
            degrees.append(Degree(label=label, level=level))
    return degrees


# ---------------------------------------------------------------------------
# Durées d'expérience
# ---------------------------------------------------------------------------
_YEARS_PATTERN = re.compile(
    r"(?<![\d.,])(\d{1,2})\s*(?:\+\s*)?(?:(?:a|-|to)\s*\d{1,2}\s*)?(?:ans|annees|annee|an|years?|yrs)\b"
)

MONTHS = {
    "jan": 1, "janv": 1, "janvier": 1, "january": 1,
    "fev": 2, "fevr": 2, "fevrier": 2, "feb": 2, "february": 2,
    "mar": 3, "mars": 3, "march": 3,
    "avr": 4, "avril": 4, "apr": 4, "april": 4,
    "mai": 5, "may": 5,
    "juin": 6, "jun": 6, "june": 6,
    "juil": 7, "juillet": 7, "jul": 7, "july": 7,
    "aout": 8, "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "septembre": 9, "september": 9,
    "oct": 10, "octobre": 10, "october": 10,
    "nov": 11, "novembre": 11, "november": 11,
    "dec": 12, "decembre": 12, "december": 12,
}


def _date_regex(p: str) -> str:
    return rf"(?:(?P<{p}m>[a-z]{{3,9}})\.?\s+|(?P<{p}n>\d{{1,2}})\s*[/.-]\s*)?(?P<{p}y>(?:19|20)\d{{2}})"


_PRESENT = r"(?P<present>present|aujourd'hui|actuellement|actuel|now|current|ce jour|en cours)"
_RANGE_PATTERN = re.compile(
    _date_regex("s") + r"\s*(?:-|–|—|a|au|to|jusqu'a|jusqu'en)\s*(?:" + _date_regex("e") + "|" + _PRESENT + ")"
)


def _month(word: str | None, number: str | None) -> int | None:
    if number and 1 <= int(number) <= 12:
        return int(number)
    if word:
        return MONTHS.get(word.rstrip("."))
    return None


def _years_near_experience(folded: str) -> list[int]:
    values = []
    for m in _YEARS_PATTERN.finditer(folded):
        window = folded[max(0, m.start() - 60): m.end() + 60]
        if "experience" in window or "exp." in window:
            values.append(int(m.group(1)))
    return values


def required_years(job_text: str) -> float | None:
    """Années d'expérience exigées par l'offre (« 3 à 5 ans » -> 3)."""
    values = _years_near_experience(strip_accents(job_text).lower())
    return float(min(values)) if values else None


def cv_years(experience_text: str, full_text: str, today: date | None = None) -> float | None:
    """Années d'expérience du CV : mention explicite, sinon somme des périodes datées."""
    explicit = _years_near_experience(strip_accents(full_text).lower())
    if explicit:
        return float(max(explicit))
    if not experience_text:
        return None

    today = today or date.today()
    now = today.year * 12 + today.month
    intervals = []
    for m in _RANGE_PATTERN.finditer(strip_accents(experience_text).lower()):
        sm = _month(m.group("sm"), m.group("sn")) or 6
        start = int(m.group("sy")) * 12 + sm
        if m.group("present"):
            end = now
        else:
            em = _month(m.group("em"), m.group("en")) or 6
            end = int(m.group("ey")) * 12 + em
        end = min(end, now)
        if end >= start:
            intervals.append((start, max(end, start + 2)))  # au moins 2 mois par période

    if not intervals:
        return None
    intervals.sort()
    merged = [list(intervals[0])]
    for start, end in intervals[1:]:
        if start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    months = sum(end - start for start, end in merged)
    return round(months / 12, 1)
