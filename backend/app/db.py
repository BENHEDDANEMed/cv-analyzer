"""Stockage SQLite : utilisateurs et historique des analyses.

SQLite suffit pour un projet étudiant (un seul fichier, aucun serveur à installer).
Les résultats complets sont stockés en JSON (validés par Pydantic à la lecture).
"""
from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .config import ROOT_DIR

DB_PATH = Path(os.getenv("DATABASE_PATH", "data/app.db"))
if not DB_PATH.is_absolute():
    DB_PATH = ROOT_DIR / DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    full_name     TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'candidat',
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS analyses (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    company         TEXT,
    cv_filename     TEXT,
    global_score    REAL NOT NULL,
    result_json     TEXT NOT NULL,
    reco_json       TEXT,
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses(user_id, created_at);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)


# ---------------------------------------------------------------------------
# Utilisateurs
# ---------------------------------------------------------------------------
class EmailAlreadyUsedError(ValueError):
    pass


def create_user(email: str, full_name: str, role: str, password_hash: str) -> dict:
    with connect() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO users (email, full_name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
                (email.lower(), full_name, role, password_hash, _now()),
            )
        except sqlite3.IntegrityError as exc:
            raise EmailAlreadyUsedError("Un compte existe déjà avec cet e-mail") from exc
        return get_user(cur.lastrowid, conn=conn)  # type: ignore[return-value]


def get_user(user_id: int, conn: sqlite3.Connection | None = None) -> dict | None:
    if conn is None:
        with connect() as c:
            return get_user(user_id, c)
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def get_user_by_email(email: str) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email.lower(),)).fetchone()
        return dict(row) if row else None


def update_user(user_id: int, **fields) -> dict:
    allowed = {k: v for k, v in fields.items() if k in {"full_name", "role", "password_hash"} and v is not None}
    with connect() as conn:
        if allowed:
            sets = ", ".join(f"{k} = ?" for k in allowed)
            conn.execute(f"UPDATE users SET {sets} WHERE id = ?", (*allowed.values(), user_id))
        return get_user(user_id, conn)  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Analyses
# ---------------------------------------------------------------------------
def save_analysis(user_id: int, title: str, company: str | None, cv_filename: str | None,
                  global_score: float, result: dict) -> int:
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO analyses (user_id, title, company, cv_filename, global_score, result_json, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user_id, title, company, cv_filename, global_score, json.dumps(result, ensure_ascii=False), _now()),
        )
        return int(cur.lastrowid)


def list_analyses(user_id: int) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, title, company, cv_filename, global_score, result_json, reco_json IS NOT NULL AS has_reco, "
            "created_at FROM analyses WHERE user_id = ? ORDER BY created_at DESC, id DESC",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_analysis(user_id: int, analysis_id: int) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM analyses WHERE id = ? AND user_id = ?", (analysis_id, user_id)
        ).fetchone()
        return dict(row) if row else None


def save_recommendations(user_id: int, analysis_id: int, reco: dict) -> None:
    with connect() as conn:
        conn.execute(
            "UPDATE analyses SET reco_json = ? WHERE id = ? AND user_id = ?",
            (json.dumps(reco, ensure_ascii=False), analysis_id, user_id),
        )


def delete_analysis(user_id: int, analysis_id: int) -> bool:
    with connect() as conn:
        cur = conn.execute("DELETE FROM analyses WHERE id = ? AND user_id = ?", (analysis_id, user_id))
        return cur.rowcount > 0
