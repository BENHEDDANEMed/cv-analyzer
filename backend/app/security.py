"""Sécurité : hachage des mots de passe (PBKDF2) et jetons d'accès JWT (HS256).

Tout est fait avec la bibliothèque standard de Python (hashlib, hmac) pour rester simple
et éviter des dépendances supplémentaires.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from . import config  # noqa: F401  (charge le fichier .env)

SECRET_KEY = os.getenv("SECRET_KEY", "changez-moi-en-production")
TOKEN_TTL_SECONDS = int(os.getenv("TOKEN_TTL_HOURS", "24")) * 3600
_PBKDF2_ITERATIONS = 200_000


class InvalidTokenError(ValueError):
    pass


# ---------------------------------------------------------------------------
# Mots de passe
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${_PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt, expected = stored.split("$")
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations))
    return hmac.compare_digest(digest.hex(), expected)  # comparaison à temps constant


# ---------------------------------------------------------------------------
# JWT (HS256)
# ---------------------------------------------------------------------------
def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(message: bytes) -> str:
    return _b64(hmac.new(SECRET_KEY.encode(), message, hashlib.sha256).digest())


def create_access_token(user_id: int, ttl: int = TOKEN_TTL_SECONDS) -> str:
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    now = int(time.time())
    payload = _b64(json.dumps({"sub": str(user_id), "iat": now, "exp": now + ttl}).encode())
    signature = _sign(f"{header}.{payload}".encode())
    return f"{header}.{payload}.{signature}"


def decode_access_token(token: str) -> int:
    """Retourne l'identifiant de l'utilisateur, ou lève InvalidTokenError."""
    try:
        header, payload, signature = token.split(".")
    except ValueError as exc:
        raise InvalidTokenError("Jeton mal formé") from exc
    if not hmac.compare_digest(signature, _sign(f"{header}.{payload}".encode())):
        raise InvalidTokenError("Signature invalide")
    try:
        data = json.loads(_unb64(payload))
    except (ValueError, json.JSONDecodeError) as exc:
        raise InvalidTokenError("Contenu du jeton invalide") from exc
    if data.get("exp", 0) < time.time():
        raise InvalidTokenError("Session expirée, reconnectez-vous")
    return int(data["sub"])
