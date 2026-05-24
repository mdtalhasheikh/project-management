from project_management import database


def test_initialize_database_creates_seed_board(tmp_path) -> None:
    db_path = tmp_path / "missing" / "project.db"

    database.initialize_database(db_path)
    board = database.get_board(database_path=db_path)

    assert db_path.exists()
    assert board["name"] == "Product Launch"
    assert [column["id"] for column in board["columns"]] == [
        "backlog",
        "ready",
        "progress",
        "review",
        "done",
    ]
    assert board["columns"][0]["cards"][0] == {
        "id": "card-positioning",
        "title": "Finalize positioning",
        "details": "Condense launch message into a single promise for the homepage and sales deck.",
    }


def test_database_mutations_persist(tmp_path) -> None:
    db_path = tmp_path / "project.db"

    renamed = database.rename_column("backlog", "Ideas", database_path=db_path)
    assert renamed["columns"][0]["name"] == "Ideas"

    created = database.create_card(
        "backlog",
        "Partner announcement",
        "Draft note",
        database_path=db_path,
    )
    created_card = created["columns"][0]["cards"][-1]
    assert created_card["title"] == "Partner announcement"

    updated = database.update_card(
        created_card["id"],
        "Partner launch announcement",
        "Draft the launch note",
        database_path=db_path,
    )
    assert updated["columns"][0]["cards"][-1]["details"] == "Draft the launch note"

    moved = database.move_card(created_card["id"], "review", database_path=db_path)
    assert moved["columns"][3]["cards"][-1]["id"] == created_card["id"]

    deleted = database.delete_card(created_card["id"], database_path=db_path)
    all_card_ids = [card["id"] for column in deleted["columns"] for card in column["cards"]]
    assert created_card["id"] not in all_card_ids

    reloaded = database.get_board(database_path=db_path)
    assert reloaded["columns"][0]["name"] == "Ideas"
