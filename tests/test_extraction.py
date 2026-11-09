"""Tests du Module 1 : nettoyage, segmentation, NER, normalisation."""
import io
from datetime import date

import docx

from backend.app.extraction.cleaner import clean_text
from backend.app.extraction.document import parse_document
from backend.app.extraction.parser import extract_text
from backend.app.extraction.segmenter import segment
from backend.app.extraction.skills_extractor import (
    cv_years, extract_degrees, extract_skills, required_years,
)
from backend.app.schemas import SectionName


def test_clean_text_removes_noise():
    raw = "Page 1/2\n• Développement d'un mo-\ndèle\x0c\nPage 2/2\nﬁn  du   texte"
    cleaned = clean_text(raw)
    assert "Page 1/2" not in cleaned
    assert "- Développement d'un modèle" in cleaned
    assert "fin du texte" in cleaned


def test_segmentation_finds_main_sections(cv_text):
    sections = segment(clean_text(cv_text))
    for name in (SectionName.EXPERIENCE, SectionName.FORMATION, SectionName.COMPETENCES, SectionName.PROJETS):
        assert name in sections
    assert "scikit-learn" in sections[SectionName.EXPERIENCE]


def test_normalisation_of_variants():
    hard, _ = extract_skills("Outils : sklearn, Scikit Learn, pytorch, Postgres")
    names = {s.name for s in hard}
    assert {"scikit-learn", "PyTorch", "PostgreSQL"} <= names
    sk = next(s for s in hard if s.name == "scikit-learn")
    assert len(sk.mentions) == 2  # deux variantes -> une seule compétence


def test_no_false_positive_inside_words():
    hard, _ = extract_skills("JavaScript et MySQL. C'est un tableau de bord.")
    names = {s.name for s in hard}
    assert "Java" not in names and "C" not in names and "Tableau Software" not in names
    assert {"JavaScript", "MySQL"} <= names


def test_soft_skills_with_accents():
    _, soft = extract_skills("Esprit d'equipe, rigoureuse et autonome")
    assert {"Travail en équipe", "Rigueur", "Autonomie"} <= {s.name for s in soft}


def test_optional_requirements_in_job(job_text):
    job = parse_document(job_text, "offre")
    by_name = {s.name: s for s in job.hard_skills}
    assert by_name["LangChain"].optional is True
    assert by_name["Python"].optional is False


def test_degrees_and_years():
    assert max(d.level for d in extract_degrees("Cycle ingénieur en IA")) == 5
    assert required_years("Expérience de 3 à 5 ans en data science") == 3
    assert required_years("Première expérience de 1 an minimum") == 1
    exp = "Stage 01/2024 - 07/2024\nDéveloppeur Python, septembre 2024 - présent"
    assert cv_years(exp, exp, today=date(2025, 9, 1)) == 1.5


def test_docx_parsing():
    document = docx.Document()
    document.add_paragraph("COMPÉTENCES")
    document.add_paragraph("Python, Docker et FastAPI pour déployer des modèles")
    buffer = io.BytesIO()
    document.save(buffer)
    text = extract_text("cv.docx", buffer.getvalue())
    assert "FastAPI" in text
