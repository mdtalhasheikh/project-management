import { BoardColumn } from "./board";

export type BoardSummary = {
  id: number;
  name: string;
  cardCount: number;
};

export type Board = {
  id: number;
  name: string;
  columns: BoardColumn[];
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResponse = {
  message: string;
  boardChanged: boolean;
  board: Board | null;
};

async function requestJson<T>(path: string, options?: RequestInit) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error("API request failed");
  }

  return (await response.json()) as T;
}

async function requestBoard(path: string, options?: RequestInit) {
  return requestJson<Board>(path, options);
}

// ─── Board API ────────────────────────────────────────────────────────────────

export function listBoards() {
  return requestJson<BoardSummary[]>("/api/boards");
}

export function fetchBoard(boardId: number) {
  return requestBoard(`/api/boards/${boardId}`);
}

export function createBoard(name: string) {
  return requestBoard("/api/boards", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function renameBoard(boardId: number, name: string) {
  return requestBoard(`/api/boards/${boardId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteBoard(boardId: number) {
  return requestJson<BoardSummary[]>(`/api/boards/${boardId}`, {
    method: "DELETE",
  });
}

// ─── Column API ───────────────────────────────────────────────────────────────

export function createColumn(boardId: number, name: string) {
  return requestBoard(`/api/boards/${boardId}/columns`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function renameColumn(boardId: number, columnId: string, name: string) {
  return requestBoard(`/api/boards/${boardId}/columns/${columnId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteColumn(boardId: number, columnId: string) {
  return requestBoard(`/api/boards/${boardId}/columns/${columnId}`, {
    method: "DELETE",
  });
}

// ─── Card API ─────────────────────────────────────────────────────────────────

export function createCard(boardId: number, columnId: string, title: string, details: string) {
  return requestBoard(`/api/boards/${boardId}/cards`, {
    method: "POST",
    body: JSON.stringify({ columnId, title, details }),
  });
}

export function updateCard(boardId: number, cardId: string, title: string, details: string) {
  return requestBoard(`/api/boards/${boardId}/cards/${cardId}`, {
    method: "PATCH",
    body: JSON.stringify({ title, details }),
  });
}

export function deleteCard(boardId: number, cardId: string) {
  return requestBoard(`/api/boards/${boardId}/cards/${cardId}`, {
    method: "DELETE",
  });
}

export function moveCard(boardId: number, cardId: string, targetColumnId: string) {
  return requestBoard(`/api/boards/${boardId}/cards/${cardId}/move`, {
    method: "POST",
    body: JSON.stringify({ targetColumnId }),
  });
}

// ─── Chat API ─────────────────────────────────────────────────────────────────

export function sendChatMessage(boardId: number, message: string, history: ChatMessage[]) {
  return requestJson<ChatResponse>(`/api/boards/${boardId}/chat`, {
    method: "POST",
    body: JSON.stringify({ message, history }),
  });
}
