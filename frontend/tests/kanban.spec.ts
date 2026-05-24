import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { initialBoard, BoardColumn } from "../src/lib/board";

type Board = {
  id: number;
  name: string;
  columns: BoardColumn[];
};

function cloneBoard(): Board {
  return {
    id: 1,
    name: "Product Launch",
    columns: structuredClone(initialBoard),
  };
}

test.beforeEach(async ({ page }) => {
  let board = cloneBoard();
  let nextCardId = 1;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === "/api/board" && method === "GET") {
      await route.fulfill({ json: board });
      return;
    }

    if (path === "/api/chat" && method === "POST") {
      const body = request.postDataJSON() as { message: string };
      if (body.message.includes("add")) {
        const card = {
          id: `card-ai-${nextCardId++}`,
          title: "AI launch card",
          details: "Created from chat.",
        };
        board = {
          ...board,
          columns: board.columns.map((column) =>
            column.id === "backlog"
              ? { ...column, cards: [...column.cards, card] }
              : column,
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
        json: {
          message: "No board changes needed.",
          boardChanged: false,
          board: null,
        },
      });
      return;
    }

    if (path.startsWith("/api/columns/") && method === "PATCH") {
      const columnId = decodeURIComponent(path.split("/").at(-1) ?? "");
      const body = request.postDataJSON() as { name: string };
      board = {
        ...board,
        columns: board.columns.map((column) =>
          column.id === columnId ? { ...column, name: body.name } : column,
        ),
      };
      await route.fulfill({ json: board });
      return;
    }

    if (path === "/api/cards" && method === "POST") {
      const body = request.postDataJSON() as {
        columnId: string;
        title: string;
        details: string;
      };
      const cleanTitle = body.title.trim();
      if (cleanTitle) {
        const card = {
          id: `card-created-${nextCardId++}`,
          title: cleanTitle,
          details: body.details.trim(),
        };
        board = {
          ...board,
          columns: board.columns.map((column) =>
            column.id === body.columnId
              ? { ...column, cards: [...column.cards, card] }
              : column,
          ),
        };
      }
      await route.fulfill({ json: board });
      return;
    }

    if (path.endsWith("/move") && method === "POST") {
      const cardId = decodeURIComponent(path.split("/").at(-2) ?? "");
      const body = request.postDataJSON() as { targetColumnId: string };
      const movingCard = board.columns.flatMap((column) => column.cards).find((card) => card.id === cardId);
      if (movingCard) {
        board = {
          ...board,
          columns: board.columns.map((column) => {
            if (column.id === body.targetColumnId) {
              return { ...column, cards: [...column.cards, movingCard] };
            }
            return { ...column, cards: column.cards.filter((card) => card.id !== cardId) };
          }),
        };
      }
      await route.fulfill({ json: board });
      return;
    }

    if (path.startsWith("/api/cards/") && method === "PATCH") {
      const cardId = decodeURIComponent(path.split("/").at(-1) ?? "");
      const body = request.postDataJSON() as { title: string; details: string };
      board = {
        ...board,
        columns: board.columns.map((column) => ({
          ...column,
          cards: column.cards.map((card) =>
            card.id === cardId
              ? { ...card, title: body.title, details: body.details }
              : card,
          ),
        })),
      };
      await route.fulfill({ json: board });
      return;
    }

    if (path.startsWith("/api/cards/") && method === "DELETE") {
      const cardId = decodeURIComponent(path.split("/").at(-1) ?? "");
      board = {
        ...board,
        columns: board.columns.map((column) => ({
          ...column,
          cards: column.cards.filter((card) => card.id !== cardId),
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
  await expect(page.getByRole("heading", { name: "Product Launch" })).toBeVisible();
}

test("requires login before showing the board", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Product Launch" })).toHaveCount(0);
});

test("shows an error for invalid credentials", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Use username user and password password.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Product Launch" })).toHaveCount(0);
});

test("loads the single board with dummy data after login", async ({ page }) => {
  await page.goto("/");
  await signIn(page);

  await expect(page.getByRole("heading", { name: "Product Launch" })).toBeVisible();
  await expect(page.getByTestId("column-backlog")).toBeVisible();
  await expect(page.getByLabel("Finalize positioning card title")).toHaveValue(
    "Finalize positioning",
  );
  await expect(page.getByTestId("column-done")).toBeVisible();
});

test("renames a column and manages cards", async ({ page }) => {
  await page.goto("/");
  await signIn(page);

  const renamePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/columns/") && response.request().method() === "PATCH",
  );
  await page.getByLabel("Backlog column name").fill("Ideas");
  await expect(page.getByLabel("Ideas column name")).toHaveValue("Ideas");
  await page.getByLabel("Ideas column name").blur();
  await renamePromise;
  await page.reload();
  await expect(page.getByLabel("Ideas column name")).toHaveValue("Ideas");

  await page.locator("#backlog-title").fill("Partner announcement");
  await page.getByTestId("column-backlog").getByRole("button", { name: "Add card" }).click();

  await expect(page.getByLabel("Partner announcement card title")).toHaveValue(
    "Partner announcement",
  );

  const titlePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/cards/") && response.request().method() === "PATCH",
  );
  await page.getByLabel("Partner announcement card title").fill("Partner launch announcement");
  await page.getByLabel("Partner launch announcement card title").blur();
  await titlePromise;

  const detailsPromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/cards/") && response.request().method() === "PATCH",
  );
  await page
    .getByLabel("Partner launch announcement card details")
    .fill("Draft the launch note for distribution partners.");
  await page.getByLabel("Partner launch announcement card details").blur();
  await detailsPromise;

  await expect(page.getByLabel("Partner launch announcement card title")).toHaveValue(
    "Partner launch announcement",
  );
  await expect(
    page.getByLabel("Partner launch announcement card details"),
  ).toHaveValue("Draft the launch note for distribution partners.");
  await page.reload();
  await expect(page.getByLabel("Partner launch announcement card title")).toHaveValue(
    "Partner launch announcement",
  );
  await expect(
    page.getByLabel("Partner launch announcement card details"),
  ).toHaveValue("Draft the launch note for distribution partners.");

  await page.getByRole("button", { name: "Delete Partner launch announcement" }).click();
  await expect(page.getByLabel("Partner launch announcement card title")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Partner launch announcement card title")).toHaveCount(0);
});

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
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, {
    steps: 12,
  });
  await page.mouse.up();

  await expect(targetColumn.getByLabel("Creative brief card title")).toHaveValue("Creative brief");
  await page.reload();
  await expect(page.getByTestId("column-review").getByLabel("Creative brief card title")).toHaveValue(
    "Creative brief",
  );
});

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

test("logs out and hides the board", async ({ page }) => {
  await page.goto("/");
  await signIn(page);

  await page.getByRole("button", { name: "Log out" }).click();

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Product Launch" })).toHaveCount(0);
});
