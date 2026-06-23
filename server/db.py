"""Persistence: one saved game-career report (+ two poems) per Steam user.

Keyed by SteamID (the OpenID identity). SQLModel + SQLite — the first thing we
actually persist. The DB file lives at <repo>/data/steam-tasting.db by default;
override with DATABASE_URL (any SQLAlchemy URL).
"""

import os
import secrets
from datetime import datetime, timezone
from pathlib import Path

from sqlmodel import Field, SQLModel, Session, create_engine, select

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite:///{DATA_DIR / 'steam-tasting.db'}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Report(SQLModel, table=True):
    """A user's latest report + poems. SteamID is the key; share_id is the
    public, unguessable handle used for sharing."""

    steamid: str = Field(primary_key=True)
    share_id: str = Field(
        index=True, unique=True, default_factory=lambda: secrets.token_urlsafe(9)
    )
    name: str = ""
    avatar: str = ""
    report_md: str = ""
    poem_modern: str = ""
    poem_classic: str = ""
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


# SQLite + threaded ASGI server: allow cross-thread use of the connection.
_connect_args = (
    {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)
engine = create_engine(DATABASE_URL, connect_args=_connect_args)


def init_db() -> None:
    if DATABASE_URL.startswith("sqlite"):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)


def _get_or_create(session: Session, steamid: str) -> Report:
    row = session.get(Report, steamid)
    if row is None:
        row = Report(steamid=steamid)
        session.add(row)
    return row


def save_report(steamid: str, content: str, name: str = "", avatar: str = "") -> None:
    """Upsert the user's report. Generating a new report clears stale poems."""
    with Session(engine) as session:
        row = _get_or_create(session, steamid)
        row.report_md = content
        if name:
            row.name = name
        if avatar:
            row.avatar = avatar
        row.poem_modern = ""
        row.poem_classic = ""
        row.updated_at = _now()
        session.add(row)
        session.commit()


def save_poem(steamid: str, kind: str, content: str) -> None:
    field = "poem_modern" if kind == "modern" else "poem_classic"
    with Session(engine) as session:
        row = _get_or_create(session, steamid)
        setattr(row, field, content)
        row.updated_at = _now()
        session.add(row)
        session.commit()


def get_report(steamid: str) -> Report | None:
    with Session(engine) as session:
        return session.get(Report, steamid)


def get_by_share(share_id: str) -> Report | None:
    with Session(engine) as session:
        return session.exec(select(Report).where(Report.share_id == share_id)).first()
