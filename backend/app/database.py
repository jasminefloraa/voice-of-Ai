from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "creditnirvana.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                last_login_at TEXT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                session_token TEXT NOT NULL UNIQUE,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                expires_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                agent TEXT NOT NULL,
                customer_name TEXT,
                objective TEXT,
                transcript TEXT,
                status TEXT DEFAULT 'active',
                outcome TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                duration_seconds INTEGER DEFAULT 0,
                error TEXT
            )
            """
        )


def create_user(name: str, email: str, password_hash: str, role: str = 'user') -> dict[str, Any]:
    with _connect() as conn:
        cursor = conn.execute(
            "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
            (name.strip(), email.strip().lower(), password_hash, role),
        )
        user_id = cursor.lastrowid
        row = conn.execute(
            "SELECT * FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    return dict(row) if row is not None else {}


def get_user_by_email(email: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ?",
            (email.strip().lower(),),
        ).fetchone()
    return dict(row) if row is not None else None


def get_user_by_id(user_id: int) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    return dict(row) if row is not None else None


def update_last_login(user_id: int) -> None:
    with _connect() as conn:
        conn.execute(
            "UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?",
            (user_id,),
        )


def create_user_session(user_id: int, session_token: str, expires_at: str) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO user_sessions (user_id, session_token, expires_at) VALUES (?, ?, ?)",
            (user_id, session_token, expires_at),
        )


def get_user_by_session_token(session_token: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT users.*
            FROM user_sessions
            JOIN users ON users.id = user_sessions.user_id
            WHERE user_sessions.session_token = ?
              AND user_sessions.expires_at > CURRENT_TIMESTAMP
            """,
            (session_token,),
        ).fetchone()
    return dict(row) if row is not None else None


def delete_user_session(session_token: str) -> None:
    with _connect() as conn:
        conn.execute(
            "DELETE FROM user_sessions WHERE session_token = ?",
            (session_token,),
        )


def create_session(session_id: str, agent: str, customer_name: str | None = None, objective: str | None = None) -> dict[str, Any]:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO sessions (session_id, agent, customer_name, objective, transcript) VALUES (?, ?, ?, ?, ?)",
            (session_id, agent, customer_name, objective, "[]"),
        )
        row = conn.execute(
            "SELECT * FROM sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    return dict(row) if row is not None else {}


def fetch_sessions() -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM sessions ORDER BY created_at DESC"
        ).fetchall()
    return [dict(row) for row in rows]


def update_session(session_id: str, *, status: str | None = None, outcome: str | None = None, transcript: str | None = None, error: str | None = None, duration_seconds: int | None = None) -> dict[str, Any]:
    fields: list[str] = []
    values: list[Any] = []
    if status is not None:
        fields.append("status = ?")
        values.append(status)
    if outcome is not None:
        fields.append("outcome = ?")
        values.append(outcome)
    if transcript is not None:
        fields.append("transcript = ?")
        values.append(transcript)
    if error is not None:
        fields.append("error = ?")
        values.append(error)
    if duration_seconds is not None:
        fields.append("duration_seconds = ?")
        values.append(duration_seconds)
    if not fields:
        return {}
    values.append(session_id)
    with _connect() as conn:
        conn.execute(
            f"UPDATE sessions SET {', '.join(fields)}, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?",
            values,
        )
        row = conn.execute(
            "SELECT * FROM sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    return dict(row) if row is not None else {}


def fetch_analytics() -> dict[str, Any]:
    sessions = fetch_sessions()
    total_calls = len(sessions)
    completed_calls = sum(1 for s in sessions if s.get("status") == "completed")
    successful = sum(1 for s in sessions if s.get("outcome") in {"converted", "success", "renewed"})
    success_rate = round((successful / total_calls) * 100, 2) if total_calls else 0.0
    return {
        "metrics": {
            "total_calls": total_calls,
            "completed_calls": completed_calls,
            "successful_commitments": successful,
            "success_rate": success_rate,
            "average_duration_seconds": round(sum((s.get("duration_seconds") or 0) for s in sessions) / total_calls, 2) if total_calls else 0,
        },
        "sessions": sessions,
    }


@contextmanager
def session_scope() -> Iterator[sqlite3.Connection]:
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()
