# Database Design

The MVP stores Kanban data in normalized SQLite tables. The UI still supports one board for the hardcoded MVP user, but the schema supports multiple users and one board per user.

## Database File

- Default path: `data/project-management.db`
- The backend creates the database file and parent `data/` directory if they do not exist.
- SQLite foreign keys should be enabled on every connection with `PRAGMA foreign_keys = ON`.

## Tables

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE columns (
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

CREATE TABLE cards (
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
```

## Ordering

- `columns.position` stores board column order.
- `cards.position` stores card order within a column.
- Moving a card updates its `column_id` and `position`.
- For the MVP, moving a card can append it to the target column by setting `position` to the next value.

Known limitation: the MVP only supports moving a card to a different column (it is appended to the end of the target). Reordering cards within the same column is not supported; dropping a card back on its own column is a no-op in both the frontend drag handling and the backend `move_card`.

## API Shape

The backend should convert rows into the frontend shape:

```json
[
  {
    "id": "backlog",
    "name": "Backlog",
    "cards": [
      {
        "id": "card-positioning",
        "title": "Finalize positioning",
        "details": "Condense launch message into a single promise for the homepage and sales deck."
      }
    ]
  }
]
```

Mapping:
- `columns.slug` maps to frontend column `id`.
- `cards.slug` maps to frontend card `id`.
- `columns.name`, `cards.title`, and `cards.details` map directly.
- Query columns by `columns.position`, then cards by `cards.position`.
- `cards.board_id` must match the board of the card's column.

## Seed Data

When the database is empty:

1. Create user `user`.
2. Create one board named `Product Launch` for that user.
3. Create fixed columns:
   - `backlog`, `Backlog`, position `0`
   - `ready`, `Ready`, position `1`
   - `progress`, `In Progress`, position `2`
   - `review`, `Review`, position `3`
   - `done`, `Done`, position `4`
4. Create initial cards:
   - `card-positioning`, column `backlog`, position `0`
   - `card-segments`, column `backlog`, position `1`
   - `card-brief`, column `ready`, position `0`
   - `card-web`, column `progress`, position `0`
   - `card-demo`, column `progress`, position `1`
   - `card-pricing`, column `review`, position `0`
   - `card-checklist`, column `done`, position `0`

Use the same titles and details currently defined in `frontend/src/lib/board.ts`.

## Mutations Supported

- Rename a column: update `columns.name` and `columns.updated_at`.
- Create a card: insert into `cards` with the next `position` for the target column.
- Update a card: update `cards.title`, `cards.details`, and `cards.updated_at`.
- Delete a card: delete from `cards`, then compact positions in that column.
- Move a card: update `cards.column_id` and `cards.position`, then compact source and target column positions.

## Initialization

On backend startup or first database access:

1. Open the SQLite database path.
2. Enable foreign keys.
3. Run `CREATE TABLE IF NOT EXISTS` statements.
4. If there is no `users.username = 'user'`, insert the seed user, board, columns, and cards in one transaction.

This keeps local startup simple and recreates a usable MVP database when the file is missing.
