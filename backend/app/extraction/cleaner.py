"""Pipeline de nettoyage du texte (BF1) : suppression du bruit visuel."""
from __future__ import annotations

import re
import unicodedata
from collections import Counter

BULLETS = "•●▪■◦○►▶✓✔➢➤→‣⁃–—*·"
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0e-\x1f\x7f​-‏﻿]")
_PAGE_NUMBER = re.compile(r"^\s*(page\s*)?\d{1,2}\s*(/|sur|of)\s*\d{1,2}\s*$", re.IGNORECASE)
_BULLET_START = re.compile(rf"^\s*[{re.escape(BULLETS)}]\s*")


def normalize_unicode(text: str) -> str:
    """Uniformise les caractères : ligatures (ﬁ -> fi), apostrophes, guillemets, espaces."""
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("’", "'").replace("‘", "'").replace("`", "'")
    text = text.replace("“", '"').replace("”", '"').replace("«", '"').replace("»", '"')
    text = text.replace(" ", " ").replace("\t", " ")
    return _CONTROL_CHARS.sub("", text)


def strip_accents(text: str) -> str:
    """'Expérience' -> 'Experience' (même longueur n'est pas garanti, usage pour la comparaison)."""
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(c for c in decomposed if unicodedata.category(c) != "Mn")


def _remove_repeated_lines(lines: list[str], n_pages: int) -> list[str]:
    """Supprime les en-têtes / pieds de page répétés sur plusieurs pages."""
    if n_pages < 2:
        return lines
    counts = Counter(l.strip().lower() for l in lines if l.strip())
    repeated = {l for l, c in counts.items() if c >= min(3, n_pages) and len(l) < 80}
    return [l for l in lines if l.strip().lower() not in repeated]


def _is_header_like(line: str) -> bool:
    return len(line) < 45 and not line.endswith((".", ",", ";"))


def _merge_broken_lines(lines: list[str]) -> list[str]:
    """Recolle les phrases coupées par la mise en page du PDF."""
    merged: list[str] = []
    for line in lines:
        if not line:
            merged.append(line)
            continue
        if merged and merged[-1]:
            previous = merged[-1]
            # mot coupé par un tiret : "dévelop-" + "pement"
            if previous.endswith("-") and line[:1].islower():
                merged[-1] = previous[:-1] + line
                continue
            # phrase qui continue en minuscule sur la ligne suivante
            if (
                line[:1].islower()
                and not previous.startswith("- ")
                and not _is_header_like(previous)
                and not previous.endswith((".", ":", ";"))
            ):
                merged[-1] = previous + " " + line
                continue
            # suite d'une puce
            if previous.startswith("- ") and line[:1].islower() and not previous.endswith("."):
                merged[-1] = previous + " " + line
                continue
        merged.append(line)
    return merged


def clean_text(raw_text: str) -> str:
    """Nettoie le texte extrait d'un CV ou d'une offre."""
    n_pages = raw_text.count("\f") + 1
    text = normalize_unicode(raw_text.replace("\f", "\n"))

    lines = []
    for line in text.split("\n"):
        line = re.sub(r" {2,}", " ", line).strip()
        if _PAGE_NUMBER.match(line):
            continue
        if _BULLET_START.match(line):
            line = "- " + _BULLET_START.sub("", line)
        if re.fullmatch(r"[-_=.\s]{3,}", line):  # lignes décoratives
            continue
        lines.append(line)

    lines = _remove_repeated_lines(lines, n_pages)
    lines = _merge_broken_lines(lines)

    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
