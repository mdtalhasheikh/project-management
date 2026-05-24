import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBoard,
  createCard,
  createColumn,
  deleteBoard,
  deleteCard,
  deleteColumn,
  fetchBoard,
  listBoards,
  moveCard,
  renameBoard,
  renameColumn,
  sendChatMessage,
} from "./api";

const board = { id: 1, name: "Product Launch", columns: [] };
const BOARD_ID = 1;

function mockFetch(value: unknown = board) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => value,
  } as Response);
}

describe("board api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Board endpoints ────────────────────────────────────────────────────────

  it("lists all boards", async () => {
    const summaries = [{ id: 1, name: "Product Launch", cardCount: 7 }];
    const fetch = mockFetch(summaries);

    await expect(listBoards()).resolves.toEqual(summaries);

    expect(fetch).toHaveBeenCalledWith("/api/boards", {
      headers: { "Content-Type": "application/json" },
    });
  });

  it("fetches a board by id", async () => {
    const fetch = mockFetch();

    await expect(fetchBoard(BOARD_ID)).resolves.toEqual(board);

    expect(fetch).toHaveBeenCalledWith(`/api/boards/${BOARD_ID}`, {
      headers: { "Content-Type": "application/json" },
    });
  });

  it("creates a board", async () => {
    const fetch = mockFetch();

    await createBoard("Sprint Planning");

    expect(fetch).toHaveBeenCalledWith("/api/boards", {
      method: "POST",
      body: JSON.stringify({ name: "Sprint Planning" }),
      headers: { "Content-Type": "application/json" },
    });
  });

  it("renames a board", async () => {
    const fetch = mockFetch();

    await renameBoard(BOARD_ID, "Q3 Launch");

    expect(fetch).toHaveBeenCalledWith(`/api/boards/${BOARD_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Q3 Launch" }),
      headers: { "Content-Type": "application/json" },
    });
  });

  it("deletes a board and returns the updated list", async () => {
    const summaries = [{ id: 2, name: "Other Board", cardCount: 0 }];
    const fetch = mockFetch(summaries);

    await expect(deleteBoard(BOARD_ID)).resolves.toEqual(summaries);

    expect(fetch).toHaveBeenCalledWith(`/api/boards/${BOARD_ID}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
  });

  // ─── Column endpoints ────────────────────────────────────────────────────────

  it("creates a column", async () => {
    const fetch = mockFetch();

    await createColumn(BOARD_ID, "Blocked");

    expect(fetch).toHaveBeenCalledWith(`/api/boards/${BOARD_ID}/columns`, {
      method: "POST",
      body: JSON.stringify({ name: "Blocked" }),
      headers: { "Content-Type": "application/json" },
    });
  });

  it("renames a column", async () => {
    const fetch = mockFetch();

    await renameColumn(BOARD_ID, "backlog", "Ideas");

    expect(fetch).toHaveBeenCalledWith(`/api/boards/${BOARD_ID}/columns/backlog`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Ideas" }),
      headers: { "Content-Type": "application/json" },
    });
  });

  it("deletes a column", async () => {
    const fetch = mockFetch();

    await deleteColumn(BOARD_ID, "backlog");

    expect(fetch).toHaveBeenCalledWith(`/api/boards/${BOARD_ID}/columns/backlog`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
  });

  // ─── Card endpoints ──────────────────────────────────────────────────────────

  it("creates a card", async () => {
    const fetch = mockFetch();

    await createCard(BOARD_ID, "backlog", "Partner announcement", "Draft note");

    expect(fetch).toHaveBeenCalledWith(`/api/boards/${BOARD_ID}/cards`, {
      method: "POST",
      body: JSON.stringify({ columnId: "backlog", title: "Partner announcement", details: "Draft note" }),
      headers: { "Content-Type": "application/json" },
    });
  });

  it("moves a card", async () => {
    const fetch = mockFetch();

    await moveCard(BOARD_ID, "card-brief", "review");

    expect(fetch).toHaveBeenCalledWith(`/api/boards/${BOARD_ID}/cards/card-brief/move`, {
      method: "POST",
      body: JSON.stringify({ targetColumnId: "review" }),
      headers: { "Content-Type": "application/json" },
    });
  });

  it("deletes a card", async () => {
    const fetch = mockFetch();

    await deleteCard(BOARD_ID, "card-brief");

    expect(fetch).toHaveBeenCalledWith(`/api/boards/${BOARD_ID}/cards/card-brief`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
  });

  // ─── Chat endpoint ───────────────────────────────────────────────────────────

  it("sends a chat message with history", async () => {
    const chatResponse = { message: "Added the card.", boardChanged: false, board: null };
    const fetch = mockFetch(chatResponse);

    await expect(
      sendChatMessage(BOARD_ID, "Add a launch card", [{ role: "assistant", content: "Hi" }]),
    ).resolves.toEqual(chatResponse);

    expect(fetch).toHaveBeenCalledWith(`/api/boards/${BOARD_ID}/chat`, {
      method: "POST",
      body: JSON.stringify({
        message: "Add a launch card",
        history: [{ role: "assistant", content: "Hi" }],
      }),
      headers: { "Content-Type": "application/json" },
    });
  });
});
