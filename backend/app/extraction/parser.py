"""Lecture des fichiers (BF1) : PDF, DOCX ou texte brut -> texte."""
from __future__ import annotations

import io
from pathlib import Path


class UnsupportedFormatError(ValueError):
    """Format de fichier non pris en charge."""


class EmptyDocumentError(ValueError):
    """Aucun texte n'a pu être extrait (PDF scanné, fichier vide...)."""


SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}


def _extract_pdf(content: bytes) -> str:
    import pdfplumber

    pages: list[str] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            text = page.extract_text(x_tolerance=1.5, y_tolerance=3) or ""
            pages.append(text)
    # Un saut de page est marqué par \f : utile pour détecter les en-têtes répétés.
    return "\f".join(pages)


def _extract_docx(content: bytes) -> str:
    import docx

    document = docx.Document(io.BytesIO(content))
    lines = [p.text for p in document.paragraphs]
    # Beaucoup de CV utilisent des tableaux pour la mise en page.
    for table in document.tables:
        for row in table.rows:
            seen: set[str] = set()
            for cell in row.cells:
                text = cell.text.strip()
                if text and text not in seen:  # cellules fusionnées = texte répété
                    seen.add(text)
                    lines.append(text)
    return "\n".join(lines)


def extract_text(filename: str, content: bytes) -> str:
    """Retourne le texte brut d'un fichier selon son extension."""
    extension = Path(filename or "").suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise UnsupportedFormatError(
            f"Format « {extension or 'inconnu'} » non pris en charge. Formats acceptés : PDF, DOCX, TXT."
        )

    if extension == ".pdf":
        text = _extract_pdf(content)
    elif extension == ".docx":
        text = _extract_docx(content)
    else:
        text = content.decode("utf-8", errors="ignore")

    if len(text.strip()) < 30:
        raise EmptyDocumentError(
            "Le document semble vide. S'il s'agit d'un PDF scanné (image), il faut d'abord un OCR."
        )
    return text
