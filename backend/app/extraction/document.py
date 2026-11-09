"""Module 1 (Phase « Extraire ») : texte brut -> document structuré (ParsedDocument)."""
from __future__ import annotations

from typing import Literal

from ..schemas import ParsedDocument, SectionName
from .cleaner import clean_text
from .segmenter import segment
from .skills_extractor import cv_years, extract_degrees, extract_skills, required_years


def parse_document(raw_text: str, kind: Literal["cv", "offre"]) -> ParsedDocument:
    text = clean_text(raw_text)
    sections = segment(text) if kind == "cv" else {SectionName.AUTRE: text}

    hard, soft = extract_skills(text, detect_optional=(kind == "offre"))

    if kind == "cv":
        formation_text = sections.get(SectionName.FORMATION, text)
        degrees = extract_degrees(formation_text) or extract_degrees(text)
        years = cv_years(sections.get(SectionName.EXPERIENCE, ""), text)
    else:
        degrees = extract_degrees(text)
        years = required_years(text)

    return ParsedDocument(
        kind=kind,
        clean_text=text,
        sections=sections,
        hard_skills=hard,
        soft_skills=soft,
        degrees=degrees,
        years_experience=years,
    )
