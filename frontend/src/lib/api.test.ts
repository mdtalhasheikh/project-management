import { afterEach, describe, expect, it, vi } from "vitest";
import { createCard, fetchBoard, moveCard, renameColumn, sendChatMessage } from "./api";

const board = { id: 1, name: "Product Launch", columns: [] };

function mockFetch() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => board,
  } as Response);
}

describe("board api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches the current board", async () => {
    const fetch = mockFetch();

    await expect(fetchBoard()).resolves.toEqual(board);

    expect(fetch).toHaveBeenCalledWith("/api/board", {
      headers: { "Content-Type": "application/json" },
    });
  });

  it("renames a column", async () => {
    const fetch = mockFetch();

    await renameColumn("backlog", "Ideas");

    expect(fetch).toHaveBeenCalledWith("/api/columns/backlog", {
      method: "PATCH",
      body: JSON.stringify({ name: "Ideas" }),
      headers: { "Content-Type": "application/json" },
    });
  });

  it("creates a card", async () => {
    const fetch = mockFetch();

    await createCard("backlog", "Partner announcement", "Draft note");

    expect(fetch).toHaveBeenCalledWith("/api/cards", {
      method: "POST",
      body: JSON.stringify({
        columnId: "backlog",
        title: "Partner announcement",
        details: "Draft note",
      }),
      headers: { "Content-Type": "application/json" },
    });
  });

  it("moves a card", async () => {
    const fetch = mockFetch();

    await moveCard("card-brief", "review");

    expect(fetch).toHaveBeenCalledWith("/api/cards/card-brief/move", {
      method: "POST",
      body: JSON.stringify({ targetColumnId: "review" }),
      headers: { "Content-Type": "application/json" },
    });
  });

  it("sends a chat message with history", async () => {
    const chatResponse = {
      message: "Added the card.",
      boardChanged: false,
      board: null,
    };
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => chatResponse,
    } as Response);

    await expect(
      sendChatMessage("Add a launch card", [{ role: "assistant", content: "Hi" }]),
    ).resolves.toEqual(chatResponse);

    expect(fetch).toHaveBeenCalledWith("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message: "Add a launch card",
        history: [{ role: "assistant", content: "Hi" }],
      }),
      headers: { "Content-Type": "application/json" },
    });
  });
});
