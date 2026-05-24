import { BoardColumn } from "./board";

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

export function fetchBoard() {
  return requestBoard("/api/board");
}

export function renameColumn(columnId: string, name: string) {
  return requestBoard(`/api/columns/${columnId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function createCard(columnId: string, title: string, details: string) {
  return requestBoard("/api/cards", {
    method: "POST",
    body: JSON.stringify({ columnId, title, details }),
  });
}

export function updateCard(cardId: string, title: string, details: string) {
  return requestBoard(`/api/cards/${cardId}`, {
    method: "PATCH",
    body: JSON.stringify({ title, details }),
  });
}

export function deleteCard(cardId: string) {
  return requestBoard(`/api/cards/${cardId}`, {
    method: "DELETE",
  });
}

export function moveCard(cardId: string, targetColumnId: string) {
  return requestBoard(`/api/cards/${cardId}/move`, {
    method: "POST",
    body: JSON.stringify({ targetColumnId }),
  });
}

export function sendChatMessage(message: string, history: ChatMessage[]) {
  return requestJson<ChatResponse>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message, history }),
  });
}
