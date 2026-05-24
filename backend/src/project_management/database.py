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
CURRENT_SCHEMA_VERSION = 2

DEFAULT_COLUMNS = [
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


# ─── Board CRUD ───────────────────────────────────────────────────────────────


def list_boards(
    username: str = DEFAULT_USER,
    database_path: Path | None = None,
) -> list[dict[str, Any]]:
    with closing(connect(database_path)) as connection:
        _ensure_schema(connection)
        user = _get_user_row(connection, username)
        rows = connection.execute(
            """
            SELECT b.id, b.name, COUNT(DISTINCT c.id) AS card_count
            FROM boards b
            LEFT JOIN columns col ON col.board_id = b.id
            LEFT JOIN cards c ON c.column_id = col.id
            WHERE b.user_id = ?
            GROUP BY b.id, b.name
            ORDER BY b.created_at
            """,
            (user["id"],),
        ).fetchall()
        return [{"id": r["id"], "name": r["name"], "cardCount": r["card_count"]} for r in rows]


def get_board(
    board_id: int | None = None,
    username: str = DEFAULT_USER,
    database_path: Path | None = None,
) -> dict[str, Any]:
    with closing(connect(database_path)) as connection:
        _ensure_schema(connection)
        board = (
            _get_board_row_by_id(connection, board_id, username)
            if board_id is not None
            else _get_first_board_row(connection, username)
        )
        return _serialize_board_row(connection, board)


def create_board(
    name: str,
    username: str = DEFAULT_USER,
    database_path: Path | None = None,
) -> dict[str, Any]:
    with closing(connect(database_path)) as connection:
        _ensure_schema(connection)
        user = _get_user_row(connection, username)
        clean_name = name.strip() or "New Board"
        cursor = connection.execute(
            "INSERT INTO boards (user_id, name) VALUES (?, ?)",
            (user["id"], clean_name),
        )
        board_id = cursor.lastrowid
        for position, (slug, col_name) in enumerate(DEFAULT_COLUMNS):
            connection.execute(
                "INSERT INTO columns (board_id, slug, name, position) VALUES (?, ?, ?, ?)",
                (board_id, slug, col_name, position),
            )
        connection.commit()
        board = _get_board_row_by_id(connection, board_id, username)
        return _serialize_board_row(connection, board)


def rename_board(
    board_id: int,
    name: str,
    username: str = DEFAULT_USER,
    database_path: Path | None = None,
) -> dict[str, Any]:
    with closing(connect(database_path)) as connection:
        _ensure_schema(connection)
        board = _get_board_row_by_id(connection, board_id, username)
        connection.execute(
            "UPDATE boards SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (name.strip() or "Untitled Board", board["id"]),
        )
        connection.commit()
        return _serialize_board_row(connection, _get_board_row_by_id(connection, board_id, username))


def delete_board(
    board_id: int,
    username: str = DEFAULT_USER,
    database_path: Path | None = None,
) -> list[dict[str, Any]]:
    with closing(connect(database_path)) as connection:
        _ensure_schema(connection)
        user = _get_user_row(connection, username)
        board = _get_board_row_by_id(connection, board_id, username)
        board_count = connection.execute(
            "SELECT COUNT(*) AS cnt FROM boards WHERE user_id = ?",
            (user["id"],),
        ).fetchone()["cnt"]
        if board_count <= 1:
            raise ValueError("Cannot delete the last board")
        connection.execute("DELETE FROM boards WHERE id = ?", (board["id"],))
        connection.commit()
        rows = connection.execute(
            """
            SELECT b.id, b.name, COUNT(DISTINCT c.id) AS card_count
            FROM boards b
            LEFT JOIN columns col ON col.board_id = b.id
            LEFT JOIN cards c ON c.column_id = col.id
            WHERE b.user_id = ?
            GROUP BY b.id, b.name
            ORDER BY b.created_at
            """,
            (user["id"],),
        ).fetchall()
        return [{"id": r["id"], "name": r["name"], "cardCount": r["card_count"]} for r in rows]


# ─── Column CRUD ─────────────────────────────────────────────────────────────


def create_column(
    board_id: int,
    name: str,
    username: str = DEFAULT_USER,
    database_path: Path | None = None,
) -> dict[str, Any]:
    with closing(connect(database_path)) as connection:
        _ensure_schema(connection)
        board = _get_board_row_by_id(connection, board_id, username)
        clean_name = name.strip() or "New Column"
        slug = f"col-{uuid.uuid4().hex[:8]}"
        position = _next_column_position(connection, board["id"])
        connection.execute(
            "INSERT INTO columns (board_id, slug, name, position) VALUES (?, ?, ?, ?)",
            (board["id"], slug, clean_name, position),
        )
        connection.commit()
        return _serialize_board_row(connection, board)


def delete_column(
    column_slug: str,
    board_id: int,
    username: str = DEFAULT_USER,
    database_path: Path | None = None,
) -> dict[str, Any]:
    with closing(connect(database_path)) as connection:
        _ensure_schema(connection)
        board = _get_board_row_by_id(connection, board_id, username)
        col_count = connection.execute(
            "SELECT COUNT(*) AS cnt FROM columns WHERE board_id = ?",
            (board["id"],),
        ).fetchone()["cnt"]
        if col_count <= 1:
            raise ValueError("Cannot delete the last column")
        column = _get_column_row(connection, board["id"], column_slug)
        connection.execute("DELETE FROM columns WHERE id = ?", (column["id"],))
        _compact_column_positions(connection, board["id"])
        connection.commit()
        return _serialize_board_row(connection, board)


def rename_column(
    column_slug: str,
    name: str,
    board_id: int | None = None,
    username: str = DEFAULT_USER,
    database_path: Path | None = None,
) -> dict[str, Any]:
    with closing(connect(database_path)) as connection:
        _ensure_schema(connection)
        board = (
            _get_board_row_by_id(connection, board_id, username)
            if board_id is not None
            else _get_first_board_row(connection, username)
        )
        column = _get_column_row(connection, board["id"], column_slug)
        connection.execute(
            "UPDATE columns SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (name, column["id"]),
        )
        connection.commit()
        return _serialize_board_row(connection, board)


# ─── Card CRUD ────────────────────────────────────────────────────────────────


def create_card(
    column_slug: str,
    title: str,
    details: str,
    board_id: int | None = None,
    username: str = DEFAULT_USER,
    database_path: Path | None = None,
) -> dict[str, Any]:
    clean_title = title.strip()
    clean_details = details.strip()
    with closing(connect(database_path)) as connection:
        _ensure_schema(connection)
        board = (
            _get_board_row_by_id(connection, board_id, username)
            if board_id is not None
            else _get_first_board_row(connection, username)
        )
        if not clean_title:
            return _serialize_board_row(connection, board)

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
        return _serialize_board_row(connection, board)


def update_card(
    card_slug: str,
    title: str,
    details: str,
    board_id: int | None = None,
    username: str = DEFAULT_USER,
    database_path: Path | None = None,
) -> dict[str, Any]:
    clean_title = title.strip()
    clean_details = details.strip()
    with closing(connect(database_path)) as connection:
        _ensure_schema(connection)
        board = (
            _get_board_row_by_id(connection, board_id, username)
            if board_id is not None
            else _get_first_board_row(connection, username)
        )
        if not clean_title:
            return _serialize_board_row(connection, board)

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
        return _serialize_board_row(connection, board)


def delete_card(
    card_slug: str,
    board_id: int | None = None,
    username: str = DEFAULT_USER,
    database_path: Path | None = None,
) -> dict[str, Any]:
    with closing(connect(database_path)) as connection:
        _ensure_schema(connection)
        board = (
            _get_board_row_by_id(connection, board_id, username)
            if board_id is not None
            else _get_first_board_row(connection, username)
        )
        card = _get_card_row(connection, board["id"], card_slug)
        source_column_id = card["column_id"]
        connection.execute("DELETE FROM cards WHERE id = ?", (card["id"],))
        _compact_card_positions(connection, source_column_id)
        connection.commit()
        return _serialize_board_row(connection, board)


def move_card(
    card_slug: str,
    target_column_slug: str,
    board_id: int | None = None,
    username: str = DEFAULT_USER,
    database_path: Path | None = None,
) -> dict[str, Any]:
    with closing(connect(database_path)) as connection:
        _ensure_schema(connection)
        board = (
            _get_board_row_by_id(connection, board_id, username)
            if board_id is not None
            else _get_first_board_row(connection, username)
        )
        card = _get_card_row(connection, board["id"], card_slug)
        target_column = _get_column_row(connection, board["id"], target_column_slug)
        if card["column_id"] == target_column["id"]:
            return _serialize_board_row(connection, board)

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
        return _serialize_board_row(connection, board)


# ─── Schema management ────────────────────────────────────────────────────────


def _get_schema_version(connection: sqlite3.Connection) -> int:
    has_version_table = connection.execute(
        "SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name='schema_version'"
    ).fetchone()["cnt"]
    if not has_version_table:
        has_boards = connection.execute(
            "SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name='boards'"
        ).fetchone()["cnt"]
        return 1 if has_boards else 0
    row = connection.execute("SELECT version FROM schema_version").fetchone()
    return int(row["version"]) if row else 0


def _ensure_schema(connection: sqlite3.Connection) -> None:
    version = _get_schema_version(connection)
    if version == 0:
        _create_v2_tables(connection)
        connection.execute("INSERT INTO schema_version (version) VALUES (?)", (CURRENT_SCHEMA_VERSION,))
        connection.commit()
        if not _user_exists(connection, DEFAULT_USER):
            _seed_database(connection)
            connection.commit()
    elif version < CURRENT_SCHEMA_VERSION:
        _migrate_to_v2(connection)
        if not _user_exists(connection, DEFAULT_USER):
            _seed_database(connection)
            connection.commit()


def _create_v2_tables(connection: sqlite3.Connection) -> None:
    connection.executescript("""
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS boards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
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
    """)


def _migrate_to_v2(connection: sqlite3.Connection) -> None:
    """Remove UNIQUE(user_id) from boards to support multiple boards per user."""
    connection.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)")

    board_sql_row = connection.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='boards'"
    ).fetchone()
    board_sql = board_sql_row["sql"] if board_sql_row else ""

    if "user_id" in board_sql and "UNIQUE" in board_sql:
        connection.execute("PRAGMA foreign_keys = OFF")
        connection.execute("""
            CREATE TABLE boards_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              name TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        """)
        connection.execute("INSERT INTO boards_new SELECT * FROM boards")
        connection.execute("DROP TABLE boards")
        connection.execute("ALTER TABLE boards_new RENAME TO boards")
        connection.execute("PRAGMA foreign_keys = ON")

    connection.execute("DELETE FROM schema_version")
    connection.execute("INSERT INTO schema_version (version) VALUES (?)", (CURRENT_SCHEMA_VERSION,))
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
    for position, (slug, name) in enumerate(DEFAULT_COLUMNS):
        cursor = connection.execute(
            "INSERT INTO columns (board_id, slug, name, position) VALUES (?, ?, ?, ?)",
            (board_id, slug, name, position),
        )
        column_ids[slug] = cursor.lastrowid

    card_positions: dict[str, int] = {}
    for slug, column_slug, title, details in INITIAL_CARDS:
        position = card_positions.get(column_slug, 0)
        card_positions[column_slug] = position + 1
        connection.execute(
            "INSERT INTO cards (board_id, column_id, slug, title, details, position) VALUES (?, ?, ?, ?, ?, ?)",
            (board_id, column_ids[column_slug], slug, title, details, position),
        )


# ─── Private helpers ──────────────────────────────────────────────────────────


def _get_user_row(connection: sqlite3.Connection, username: str) -> sqlite3.Row:
    row = connection.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if row is None:
        raise LookupError("User not found")
    return row


def _get_first_board_row(connection: sqlite3.Connection, username: str) -> sqlite3.Row:
    board = connection.execute(
        """
        SELECT boards.id, boards.name
        FROM boards
        JOIN users ON users.id = boards.user_id
        WHERE users.username = ?
        ORDER BY boards.created_at
        LIMIT 1
        """,
        (username,),
    ).fetchone()
    if board is None:
        raise LookupError("No board found")
    return board


def _get_board_row_by_id(
    connection: sqlite3.Connection,
    board_id: int,
    username: str,
) -> sqlite3.Row:
    board = connection.execute(
        """
        SELECT boards.id, boards.name
        FROM boards
        JOIN users ON users.id = boards.user_id
        WHERE boards.id = ? AND users.username = ?
        """,
        (board_id, username),
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


def _get_card_row(
    connection: sqlite3.Connection,
    board_id: int,
    card_slug: str,
) -> sqlite3.Row:
    card = connection.execute(
        "SELECT id, column_id FROM cards WHERE board_id = ? AND slug = ?",
        (board_id, card_slug),
    ).fetchone()
    if card is None:
        raise LookupError("Card not found")
    return card


def _serialize_board_row(connection: sqlite3.Connection, board: sqlite3.Row) -> dict[str, Any]:
    columns = connection.execute(
        "SELECT id, slug, name FROM columns WHERE board_id = ? ORDER BY position",
        (board["id"],),
    ).fetchall()
    return {
        "id": board["id"],
        "name": board["name"],
        "columns": [_column_to_dict(connection, column) for column in columns],
    }


def _column_to_dict(connection: sqlite3.Connection, column: sqlite3.Row) -> dict[str, Any]:
    cards = connection.execute(
        "SELECT slug, title, details FROM cards WHERE column_id = ? ORDER BY position",
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


def _next_column_position(connection: sqlite3.Connection, board_id: int) -> int:
    row = connection.execute(
        "SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM columns WHERE board_id = ?",
        (board_id,),
    ).fetchone()
    return int(row["next_pos"])


def _next_card_position(connection: sqlite3.Connection, column_id: int) -> int:
    row = connection.execute(
        "SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM cards WHERE column_id = ?",
        (column_id,),
    ).fetchone()
    return int(row["next_pos"])


def _compact_column_positions(connection: sqlite3.Connection, board_id: int) -> None:
    columns = connection.execute(
        "SELECT id FROM columns WHERE board_id = ? ORDER BY position",
        (board_id,),
    ).fetchall()
    for position, col in enumerate(columns):
        connection.execute("UPDATE columns SET position = ? WHERE id = ?", (position, col["id"]))


def _compact_card_positions(connection: sqlite3.Connection, column_id: int) -> None:
    cards = connection.execute(
        "SELECT id FROM cards WHERE column_id = ? ORDER BY position",
        (column_id,),
    ).fetchall()
    for position, card in enumerate(cards):
        connection.execute("UPDATE cards SET position = ? WHERE id = ?", (position, card["id"]))
