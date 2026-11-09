"""Client LLM générique (API compatible OpenAI) : Ollama en local, Groq, OpenAI..."""
from __future__ import annotations

import json
import logging
import re

from ..config import settings

logger = logging.getLogger(__name__)


class LLMUnavailableError(RuntimeError):
    pass


def _extract_json(text: str) -> dict:
    """Récupère l'objet JSON même si le modèle ajoute du texte ou des balises ```json."""
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("Aucun objet JSON dans la réponse du LLM")
    return json.loads(text[start: end + 1])


def chat_json(system_prompt: str, messages: list[dict]) -> dict:
    """Envoie la conversation et retourne la réponse JSON du modèle."""
    if not settings.llm_configured:
        raise LLMUnavailableError("LLM non configuré (LLM_BASE_URL / LLM_MODEL)")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise LLMUnavailableError("Le paquet « openai » n'est pas installé") from exc

    client = OpenAI(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key or "none",
        timeout=settings.llm_timeout,
    )
    try:
        response = client.chat.completions.create(
            model=settings.llm_model,
            temperature=settings.llm_temperature,  # faible : réponses stables, peu de « divagation »
            response_format={"type": "json_object"},
            messages=[{"role": "system", "content": system_prompt}, *messages],
        )
    except Exception as exc:
        raise LLMUnavailableError(f"Appel LLM impossible : {exc}") from exc
    content = response.choices[0].message.content or ""
    return _extract_json(content)
