from __future__ import annotations

import os
import sqlite3
import uuid
from contextlib import closing
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DATABASE_PATH = PROJECT_ROOT / "data" / "project-management.db"
DEFAULT_USER = "user"

INITIAL_COLUMNS = [
    ("backlog", "Backlog"),
    ("ready", "Ready"),
    ("progress", "In Progress"),
    ("review", "Review"),
    ("done", "Done"),
]

INITIAL_CARDS = [
    (
        "card-positioning",
        "backlog",
        "Finalize positioning",
        "Condense launch message into a single promise for the homepage and sales deck.",
    ),
    (
        "card-segments",
        "backlog",
        "Prioritize audience segments",
        "Rank the first three customer profiles for the launch sprint.",
    ),
    (
        "card-brief",
        "ready",
        "Creative brief",
        "Prepare the design brief for social launch assets and email headers.",
    ),
    (
        "card-web",
        "progress",
        "Landing page QA",
        "Review responsive states, form validation, and analytics events before release.",
    ),
    (
        "card-demo",
        "progress",
        "Sales demo script",
        "Tighten the five-minute demo narrative around the core workflow.",
    ),
    (
        "card-pricing",
        "review",
        "Pricing page copy",
        "Legal and product are checking plan names, feature limits, and disclaimers.",
    ),
    (
        "card-checklist",
        "done",
        "Launch checklist",
        "Confirm owners for support, incident response, and launch-day communications.",
    ),
]


def get_database_path() -> Path:
    return Path(os.environ.get("PROJECT_MANAGEMENT_DB_PATH", DEFAULT_DATABASE_PATH))


def connect(database_path: Path | None = None) -> sqlite3.Connection:
    path = database_path or get_database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database(database_path: Path | None = None) -> None:
    with closing(connect(database_path)) as connection:
        _ensure_schema(connection)


def get_board(username: str = DEFAULT_USER, database_path: Path | None = None) -> dict[str, Any]:
    with closing(connect(database_path)) as connection:
        _ensure_schema(connection)
        return _serialize_board(connection, username)


def rename_column(
    column_slug: str,
    name: str,
    username: str = DEFAULT_USER,
    database_path: Path | None = None,
) -> dict[str, Any]:
    with closing(connect(database_path)) as connection:
        _ensure_schema(connection)
        board = _get_board_row(connection, username)
        column = _get_column_row(connection, board["id"], column_slug)
        connection.execute(
            "UPDATE columns SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (name, column["id"]),
        )
        connection.commit()
        return _serialize_board(connection, username)


def create_card(
    column_slug: str,
    title: str,
    details: str,
    username: str = DEFAULT_USER,
    database_path: Path | None = None,
) -> dict[str, Any]:
    clean_title = title.strip()
    clean_details = details.strip()
    with closing(connect(database_path)) as connection:
        _ensure_schema(connection)
        if not clean_title:
            return _serialize_board(connection, username)

        board = _get_board_row(connection, username)
        column = _get_column_row(connection, board["id"], column_slug)
        position = _next_card_position(connection, column["id"])
        connection.execute(
            """
            INSERT INTO cards (board_id, column_id, slug, title, details, position)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                board["id"],
                column["id"],
                f"card-{uuid.uuid4().hex[:8]}",
                clean_title,
                clean_details,
                position,
            ),
        )
        connection.commit()
        return _serialize_board(connection, username)


def update_card(
    card_slug: str,
    title: str,
    details: str,
    username: str = DEFAULT_USER,
    database_path: Path | None = None,
) -> dict[str, Any]:
    clean_title = title.strip()
    clean_details = details.strip()
    with closing(connect(database_path)) as connection:
        _ensure_schema(connection)
        if not clean_title:
            return _serialize_board(connection, username)

        board = _get_board_row(connection, username)
        card = _get_card_row(connection, board["id"], card_slug)
        connection.execute(
            """
            UPDATE cards
            SET title = ?, details = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (clean_title, clean_details, card["id"]),
        )
        connection.commit()
        return _serialize_board(connection, username)


def delete_card(
    card_slug: str,
    username: str = DEFAULT_USER,
    database_path: Path | None = None,
) -> dict[str, Any]:
    with closing(connect(database_path)) as connection:
        _ensure_schema(connection)
        board = _get_board_row(connection, username)
        card = _get_card_row(connection, board["id"], card_slug)
        source_column_id = card["column_id"]
        connection.execute("DELETE FROM cards WHERE id = ?", (card["id"],))
        _compact_card_positions(connection, source_column_id)
        connection.commit()
        return _serialize_board(connection, username)


def move_card(
    card_slug: str,
    target_column_slug: str,
    username: str = DEFAULT_USER,
    database_path: Path | None = None,
) -> dict[str, Any]:
    with closing(connect(database_path)) as connection:
        _ensure_schema(connection)
        board = _get_board_row(connection, username)
        card = _get_card_row(connection, board["id"], card_slug)
        target_column = _get_column_row(connection, board["id"], target_column_slug)
        if card["column_id"] == target_column["id"]:
            return _serialize_board(connection, username)

        source_column_id = card["column_id"]
        target_position = _next_card_position(connection, target_column["id"])
        connection.execute(
            """
            UPDATE cards
            SET column_id = ?, position = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (target_column["id"], target_position, card["id"]),
        )
        _compact_card_positions(connection, source_column_id)
        connection.commit()
        return _serialize_board(connection, username)


def _ensure_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS boards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL UNIQUE,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS columns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          board_id INTEGER NOT NULL,
          slug TEXT NOT NULL,
          name TEXT NOT NULL,
          position INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (board_id) REFERENCES boards (id) ON DELETE CASCADE,
          UNIQUE (board_id, slug),
          UNIQUE (board_id, position)
        );

        CREATE TABLE IF NOT EXISTS cards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          board_id INTEGER NOT NULL,
          column_id INTEGER NOT NULL,
          slug TEXT NOT NULL,
          title TEXT NOT NULL,
          details TEXT NOT NULL DEFAULT '',
          position INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (board_id) REFERENCES boards (id) ON DELETE CASCADE,
          FOREIGN KEY (column_id) REFERENCES columns (id) ON DELETE CASCADE,
          UNIQUE (column_id, position),
          UNIQUE (board_id, slug)
        );
        """
    )
    if not _user_exists(connection, DEFAULT_USER):
        _seed_database(connection)
        connection.commit()


def _user_exists(connection: sqlite3.Connection, username: str) -> bool:
    row = connection.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    return row is not None


def _seed_database(connection: sqlite3.Connection) -> None:
    cursor = connection.execute("INSERT INTO users (username) VALUES (?)", (DEFAULT_USER,))
    user_id = cursor.lastrowid
    cursor = connection.execute(
        "INSERT INTO boards (user_id, name) VALUES (?, ?)",
        (user_id, "Product Launch"),
    )
    board_id = cursor.lastrowid

    column_ids: dict[str, int] = {}
    for position, (slug, name) in enumerate(INITIAL_COLUMNS):
        cursor = connection.execute(
            """
            INSERT INTO columns (board_id, slug, name, position)
            VALUES (?, ?, ?, ?)
            """,
            (board_id, slug, name, position),
        )
        column_ids[slug] = cursor.lastrowid

    card_positions: dict[str, int] = {}
    for slug, column_slug, title, details in INITIAL_CARDS:
        position = card_positions.get(column_slug, 0)
        card_positions[column_slug] = position + 1
        connection.execute(
            """
            INSERT INTO cards (board_id, column_id, slug, title, details, position)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (board_id, column_ids[column_slug], slug, title, details, position),
        )


def _serialize_board(connection: sqlite3.Connection, username: str) -> dict[str, Any]:
    board = _get_board_row(connection, username)
    columns = connection.execute(
        """
        SELECT id, slug, name
        FROM columns
        WHERE board_id = ?
        ORDER BY position
        """,
        (board["id"],),
    ).fetchall()
    return {
        "id": board["id"],
        "name": board["name"],
        "columns": [_column_to_dict(connection, column) for column in columns],
    }


def _get_board_row(connection: sqlite3.Connection, username: str) -> sqlite3.Row:
    board = connection.execute(
        """
        SELECT boards.id, boards.name
        FROM boards
        JOIN users ON users.id = boards.user_id
        WHERE users.username = ?
        """,
        (username,),
    ).fetchone()
    if board is None:
        raise LookupError("Board not found")
    return board


def _get_column_row(
    connection: sqlite3.Connection,
    board_id: int,
    column_slug: str,
) -> sqlite3.Row:
    column = connection.execute(
        "SELECT id, slug, name FROM columns WHERE board_id = ? AND slug = ?",
        (board_id, column_slug),
    ).fetchone()
    if column is None:
        raise LookupError("Column not found")
    return column


def _get_card_row(connection: sqlite3.Connection, board_id: int, card_slug: str) -> sqlite3.Row:
    card = connection.execute(
        "SELECT id, column_id FROM cards WHERE board_id = ? AND slug = ?",
        (board_id, card_slug),
    ).fetchone()
    if card is None:
        raise LookupError("Card not found")
    return card


def _column_to_dict(connection: sqlite3.Connection, column: sqlite3.Row) -> dict[str, Any]:
    cards = connection.execute(
        """
        SELECT slug, title, details
        FROM cards
        WHERE column_id = ?
        ORDER BY position
        """,
        (column["id"],),
    ).fetchall()
    return {
        "id": column["slug"],
        "name": column["name"],
        "cards": [
            {"id": card["slug"], "title": card["title"], "details": card["details"]}
            for card in cards
        ],
    }


def _next_card_position(connection: sqlite3.Connection, column_id: int) -> int:
    row = connection.execute(
        "SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM cards WHERE column_id = ?",
        (column_id,),
    ).fetchone()
    return int(row["next_position"])


def _compact_card_positions(connection: sqlite3.Connection, column_id: int) -> None:
    cards = connection.execute(
        "SELECT id FROM cards WHERE column_id = ? ORDER BY position",
        (column_id,),
    ).fetchall()
    for position, card in enumerate(cards):
        connection.execute(
            "UPDATE cards SET position = ? WHERE id = ?",
            (position, card["id"]),
        )
