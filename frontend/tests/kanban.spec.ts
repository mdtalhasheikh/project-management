import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { initialBoard, BoardColumn } from "../src/lib/board";

const BOARD_ID = 1;

type Board = {
  id: number;
  name: string;
  columns: BoardColumn[];
};

type BoardSummary = {
  id: number;
  name: string;
  cardCount: number;
};

function cloneBoard(): Board {
  return {
    id: BOARD_ID,
    name: "Product Launch",
    columns: structuredClone(initialBoard),
  };
}

function boardToSummary(board: Board): BoardSummary {
  return {
    id: board.id,
    name: board.name,
    cardCount: board.columns.reduce((n, col) => n + col.cards.length, 0),
  };
}

test.beforeEach(async ({ page }) => {
  let board = cloneBoard();
  let extraBoards: Board[] = [];
  let nextBoardId = 2;
  let nextCardId = 1;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    // GET /api/boards  (list)
    if (path === "/api/boards" && method === "GET") {
      const all = [board, ...extraBoards];
      await route.fulfill({ json: all.map(boardToSummary) });
      return;
    }

    // POST /api/boards  (create)
    if (path === "/api/boards" && method === "POST") {
      const body = request.postDataJSON() as { name: string };
      const newBoard: Board = {
        id: nextBoardId++,
        name: body.name,
        columns: structuredClone(initialBoard),
      };
      extraBoards.push(newBoard);
      await route.fulfill({ json: newBoard });
      return;
    }

    // GET /api/boards/:id
    if (path.match(/^\/api\/boards\/\d+$/) && method === "GET") {
      const id = parseInt(path.split("/").at(-1) ?? "0");
      const found = [board, ...extraBoards].find((b) => b.id === id);
      if (!found) {
        await route.fulfill({ status: 404, json: { detail: "Board not found" } });
        return;
      }
      await route.fulfill({ json: found });
      return;
    }

    // PATCH /api/boards/:id  (rename board)
    if (path.match(/^\/api\/boards\/\d+$/) && method === "PATCH") {
      const id = parseInt(path.split("/").at(-1) ?? "0");
      const body = request.postDataJSON() as { name: string };
      if (id === BOARD_ID) {
        board = { ...board, name: body.name };
        await route.fulfill({ json: board });
      } else {
        const b = extraBoards.find((b) => b.id === id);
        if (b) {
          b.name = body.name;
          await route.fulfill({ json: b });
        }
      }
      return;
    }

    // DELETE /api/boards/:id
    if (path.match(/^\/api\/boards\/\d+$/) && method === "DELETE") {
      const id = parseInt(path.split("/").at(-1) ?? "0");
      extraBoards = extraBoards.filter((b) => b.id !== id);
      const all = [board, ...extraBoards];
      await route.fulfill({ json: all.map(boardToSummary) });
      return;
    }

    // POST /api/boards/:id/columns  (create column)
    if (path.match(/^\/api\/boards\/\d+\/columns$/) && method === "POST") {
      const body = request.postDataJSON() as { name: string };
      const slug = `col-new-${nextCardId++}`;
      board.columns.push({ id: slug, name: body.name, cards: [] });
      await route.fulfill({ json: board });
      return;
    }

    // PATCH /api/boards/:id/columns/:colId
    if (path.match(/^\/api\/boards\/\d+\/columns\/.+$/) && method === "PATCH") {
      const colId = decodeURIComponent(path.split("/").at(-1) ?? "");
      const body = request.postDataJSON() as { name: string };
      board = {
        ...board,
        columns: board.columns.map((col) =>
          col.id === colId ? { ...col, name: body.name } : col
        ),
      };
      await route.fulfill({ json: board });
      return;
    }

    // DELETE /api/boards/:id/columns/:colId
    if (path.match(/^\/api\/boards\/\d+\/columns\/.+$/) && method === "DELETE") {
      const colId = decodeURIComponent(path.split("/").at(-1) ?? "");
      board = {
        ...board,
        columns: board.columns.filter((col) => col.id !== colId),
      };
      await route.fulfill({ json: board });
      return;
    }

    // POST /api/boards/:id/chat
    if (path.match(/^\/api\/boards\/\d+\/chat$/) && method === "POST") {
      const body = request.postDataJSON() as { message: string };
      if (body.message.includes("add")) {
        const card = {
          id: `card-ai-${nextCardId++}`,
          title: "AI launch card",
          details: "Created from chat.",
        };
        board = {
          ...board,
          columns: board.columns.map((col) =>
            col.id === "backlog" ? { ...col, cards: [...col.cards, card] } : col
          ),
        };
        await route.fulfill({
          json: {
            message: "Added AI launch card to Backlog.",
            boardChanged: true,
            board,
          },
        });
        return;
      }
      await route.fulfill({
        json: { message: "No board changes needed.", boardChanged: false, board: null },
      });
      return;
    }

    // POST /api/boards/:id/cards
    if (path.match(/^\/api\/boards\/\d+\/cards$/) && method === "POST") {
      const body = request.postDataJSON() as { columnId: string; title: string; details: string };
      const cleanTitle = body.title.trim();
      if (cleanTitle) {
        const card = {
          id: `card-created-${nextCardId++}`,
          title: cleanTitle,
          details: body.details.trim(),
        };
        board = {
          ...board,
          columns: board.columns.map((col) =>
            col.id === body.columnId ? { ...col, cards: [...col.cards, card] } : col
          ),
        };
      }
      await route.fulfill({ json: board });
      return;
    }

    // POST /api/boards/:id/cards/:cardId/move
    if (path.match(/^\/api\/boards\/\d+\/cards\/.+\/move$/) && method === "POST") {
      const cardId = decodeURIComponent(path.split("/").at(-2) ?? "");
      const body = request.postDataJSON() as { targetColumnId: string };
      const movingCard = board.columns.flatMap((col) => col.cards).find((c) => c.id === cardId);
      if (movingCard) {
        board = {
          ...board,
          columns: board.columns.map((col) => {
            if (col.id === body.targetColumnId) {
              return { ...col, cards: [...col.cards, movingCard] };
            }
            return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
          }),
        };
      }
      await route.fulfill({ json: board });
      return;
    }

    // PATCH /api/boards/:id/cards/:cardId
    if (path.match(/^\/api\/boards\/\d+\/cards\/.+$/) && method === "PATCH") {
      const cardId = decodeURIComponent(path.split("/").at(-1) ?? "");
      const body = request.postDataJSON() as { title: string; details: string };
      board = {
        ...board,
        columns: board.columns.map((col) => ({
          ...col,
          cards: col.cards.map((c) =>
            c.id === cardId ? { ...c, title: body.title, details: body.details } : c
          ),
        })),
      };
      await route.fulfill({ json: board });
      return;
    }

    // DELETE /api/boards/:id/cards/:cardId
    if (path.match(/^\/api\/boards\/\d+\/cards\/.+$/) && method === "DELETE") {
      const cardId = decodeURIComponent(path.split("/").at(-1) ?? "");
      board = {
        ...board,
        columns: board.columns.map((col) => ({
          ...col,
          cards: col.cards.filter((c) => c.id !== cardId),
        })),
      };
      await route.fulfill({ json: board });
      return;
    }

    await route.fulfill({ status: 404, json: { detail: "Not found" } });
  });
});

async function signIn(page: Page) {
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByLabel("Board name")).toHaveValue("Product Launch");
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

test("requires login before showing the board", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Board name")).toHaveCount(0);
});

test("shows an error for invalid credentials", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Use username user and password password.")).toBeVisible();
  await expect(page.getByLabel("Board name")).toHaveCount(0);
});

// ─── Board loading ─────────────────────────────────────────────────────────────

test("loads the single board with dummy data after login", async ({ page }) => {
  await page.goto("/");
  await signIn(page);

  await expect(page.getByLabel("Board name")).toHaveValue("Product Launch");
  await expect(page.getByTestId("column-backlog")).toBeVisible();
  await expect(page.getByLabel("Finalize positioning card title")).toHaveValue("Finalize positioning");
  await expect(page.getByTestId("column-done")).toBeVisible();
});

// ─── Column + card management ─────────────────────────────────────────────────

test("renames a column and manages cards", async ({ page }) => {
  await page.goto("/");
  await signIn(page);

  const renamePromise = page.waitForResponse(
    (r) => r.url().includes("/api/boards/") && r.url().includes("/columns/") && r.request().method() === "PATCH"
  );
  await page.getByLabel("Backlog column name").fill("Ideas");
  await expect(page.getByLabel("Ideas column name")).toHaveValue("Ideas");
  await page.getByLabel("Ideas column name").blur();
  await renamePromise;
  await page.reload();
  await expect(page.getByLabel("Ideas column name")).toHaveValue("Ideas");

  await page.locator("#backlog-title").fill("Partner announcement");
  await page.getByTestId("column-backlog").getByRole("button", { name: "Add card" }).click();
  await expect(page.getByLabel("Partner announcement card title")).toHaveValue("Partner announcement");

  const titlePromise = page.waitForResponse(
    (r) => r.url().includes("/api/boards/") && r.url().includes("/cards/") && r.request().method() === "PATCH"
  );
  await page.getByLabel("Partner announcement card title").fill("Partner launch announcement");
  await page.getByLabel("Partner launch announcement card title").blur();
  await titlePromise;

  const detailsPromise = page.waitForResponse(
    (r) => r.url().includes("/api/boards/") && r.url().includes("/cards/") && r.request().method() === "PATCH"
  );
  await page.getByLabel("Partner launch announcement card details").fill("Draft the launch note for distribution partners.");
  await page.getByLabel("Partner launch announcement card details").blur();
  await detailsPromise;

  await expect(page.getByLabel("Partner launch announcement card title")).toHaveValue("Partner launch announcement");
  await expect(page.getByLabel("Partner launch announcement card details")).toHaveValue(
    "Draft the launch note for distribution partners."
  );
  await page.reload();
  await expect(page.getByLabel("Partner launch announcement card title")).toHaveValue("Partner launch announcement");

  await page.getByRole("button", { name: "Delete Partner launch announcement" }).click();
  await expect(page.getByLabel("Partner launch announcement card title")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Partner launch announcement card title")).toHaveCount(0);
});

// ─── Drag and drop ────────────────────────────────────────────────────────────

test("moves a card between columns with drag and drop", async ({ page }) => {
  await page.goto("/");
  await signIn(page);

  const dragHandle = page.getByRole("button", { name: "Drag Creative brief" });
  const targetColumn = page.getByTestId("column-review");
  const handleBox = await dragHandle.boundingBox();
  const targetBox = await targetColumn.boundingBox();

  expect(handleBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect(targetColumn.getByLabel("Creative brief card title")).toHaveValue("Creative brief");
  await page.reload();
  await expect(page.getByTestId("column-review").getByLabel("Creative brief card title")).toHaveValue("Creative brief");
});

// ─── AI chat ─────────────────────────────────────────────────────────────────

test("chats with the AI without changing the board", async ({ page }) => {
  await page.goto("/");
  await signIn(page);

  await expect(page.getByRole("heading", { name: "Board chat" })).toBeVisible();
  await page.getByLabel("Message AI assistant").fill("What should I review next?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("What should I review next?")).toBeVisible();
  await expect(page.getByText("No board changes needed.")).toBeVisible();
});

test("refreshes the board when AI chat returns an update", async ({ page }) => {
  await page.goto("/");
  await signIn(page);

  await page.getByLabel("Message AI assistant").fill("add a launch card");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Added AI launch card to Backlog.")).toBeVisible();
  await expect(page.getByLabel("AI launch card card title")).toHaveValue("AI launch card");
});

// ─── Board switching ──────────────────────────────────────────────────────────

test("creates a new board and switches to it", async ({ page }) => {
  await page.goto("/");
  await signIn(page);

  await page.getByLabel("Switch board").click();
  await page.getByRole("button", { name: "New board" }).click();

  await expect(page.getByLabel("Board name")).toHaveValue("New Board");
  await expect(page.getByTestId("column-backlog")).toBeVisible();
});

// ─── Column creation ──────────────────────────────────────────────────────────

test("adds a new column to the board", async ({ page }) => {
  await page.goto("/");
  await signIn(page);

  await page.getByRole("button", { name: "Add column" }).click();
  await page.getByLabel("New column name").fill("Blocked");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByLabel("Blocked column name")).toHaveValue("Blocked");
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

test("logs out and hides the board", async ({ page }) => {
  await page.goto("/");
  await signIn(page);

  await page.getByRole("button", { name: "Log out" }).click();

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Board name")).toHaveCount(0);
});
