"use client";

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, GripVertical, Plus, Send, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Board,
  BoardSummary,
  ChatMessage,
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
  updateCard,
} from "@/lib/api";
import { BoardColumn, Card } from "@/lib/board";

type CardFormState = Record<string, { title: string; details: string }>;
type DragAttributes = ReturnType<typeof useDraggable>["attributes"];
type DragListeners = ReturnType<typeof useDraggable>["listeners"];

const emptyForm = { title: "", details: "" };

const SESSION_KEY = "signedIn";

function subscribeSession(callback: () => void) {
  window.addEventListener("session-change", callback);
  return () => window.removeEventListener("session-change", callback);
}

function setSession(signedIn: boolean) {
  if (signedIn) {
    sessionStorage.setItem(SESSION_KEY, "true");
  } else {
    sessionStorage.removeItem(SESSION_KEY);
  }
  window.dispatchEvent(new Event("session-change"));
}

export default function Home() {
  const isSignedIn = useSyncExternalStore(
    subscribeSession,
    () => sessionStorage.getItem(SESSION_KEY) === "true",
    () => false,
  );

  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [boardName, setBoardName] = useState("");
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [forms, setForms] = useState<CardFormState>({});
  const [isLoadingBoard, setIsLoadingBoard] = useState(false);
  const [boardError, setBoardError] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatError, setChatError] = useState("");
  const [showBoardMenu, setShowBoardMenu] = useState(false);

  function applyBoard(board: Board) {
    setBoardName(board.name);
    setColumns(board.columns);
    setForms((current) => ({
      ...Object.fromEntries(
        board.columns.map((column) => [column.id, current[column.id] ?? emptyForm]),
      ),
    }));
  }

  const loadBoard = useCallback(async (boardId: number) => {
    setIsLoadingBoard(true);
    setBoardError("");
    try {
      applyBoard(await fetchBoard(boardId));
    } catch {
      setBoardError("Could not load the board. Please try again.");
    } finally {
      setIsLoadingBoard(false);
    }
  }, []);

  useEffect(() => {
    if (!isSignedIn) return;

    async function init() {
      setIsLoadingBoard(true);
      setBoardError("");
      try {
        const boardList = await listBoards();
        setBoards(boardList);
        if (boardList.length > 0) {
          const id = boardList[0].id;
          setActiveBoardId(id);
          applyBoard(await fetchBoard(id));
        }
      } catch {
        setBoardError("Could not load boards. Please try again.");
      } finally {
        setIsLoadingBoard(false);
      }
    }

    void init();
  }, [isSignedIn]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const cardsById = useMemo(() => {
    return new Map(columns.flatMap((col) => col.cards.map((card) => [card.id, card])));
  }, [columns]);

  const activeCard = activeCardId ? cardsById.get(activeCardId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveCardId(String(event.active.id));
  }

  async function runBoardMutation(mutation: () => Promise<Board>) {
    setBoardError("");
    try {
      applyBoard(await mutation());
    } catch {
      setBoardError("Could not save the change. Please try again.");
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const overId = event.over?.id;
    if (overId && activeBoardId !== null) {
      void runBoardMutation(() => moveCard(activeBoardId, String(event.active.id), String(overId)));
    }
    setActiveCardId(null);
  }

  function handleAddCard(columnId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeBoardId === null) return;
    const form = forms[columnId] ?? emptyForm;
    void runBoardMutation(() => createCard(activeBoardId, columnId, form.title, form.details));
    setForms((current) => ({ ...current, [columnId]: emptyForm }));
  }

  async function handleSwitchBoard(boardId: number) {
    setShowBoardMenu(false);
    setActiveBoardId(boardId);
    setChatMessages([]);
    setChatError("");
    await loadBoard(boardId);
  }

  async function handleCreateBoard() {
    setShowBoardMenu(false);
    setBoardError("");
    try {
      const board = await createBoard("New Board");
      const updated = await listBoards();
      setBoards(updated);
      setActiveBoardId(board.id);
      applyBoard(board);
      setChatMessages([]);
      setChatError("");
    } catch {
      setBoardError("Could not create board. Please try again.");
    }
  }

  async function handleDeleteBoard() {
    if (activeBoardId === null) return;
    setBoardError("");
    try {
      const remaining = await deleteBoard(activeBoardId);
      setBoards(remaining);
      const nextId = remaining[0].id;
      setActiveBoardId(nextId);
      await loadBoard(nextId);
      setChatMessages([]);
      setChatError("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setBoardError(msg.includes("last board") ? "Cannot delete the last board." : "Could not delete board.");
    }
  }

  async function handleRenameBoard(name: string) {
    if (activeBoardId === null) return;
    setBoardError("");
    try {
      const board = await renameBoard(activeBoardId, name);
      applyBoard(board);
      setBoards((prev) => prev.map((b) => (b.id === activeBoardId ? { ...b, name } : b)));
    } catch {
      setBoardError("Could not rename board.");
    }
  }

  function handleSignIn() {
    setSession(true);
  }

  function handleLogout() {
    setSession(false);
    setBoards([]);
    setActiveBoardId(null);
    setColumns([]);
    setForms({});
    setBoardError("");
    setChatMessages([]);
    setChatError("");
  }

  async function handleSendChat(message: string) {
    if (activeBoardId === null) return;
    const userMessage: ChatMessage = { role: "user", content: message };
    const history = chatMessages;
    setChatMessages((current) => [...current, userMessage]);
    setIsSendingChat(true);
    setChatError("");

    try {
      const response = await sendChatMessage(activeBoardId, message, history);
      setChatMessages((current) => [
        ...current,
        { role: "assistant", content: response.message },
      ]);
      if (response.boardChanged && response.board) {
        applyBoard(response.board);
      }
    } catch {
      setChatError("Could not reach the AI assistant. Please try again.");
    } finally {
      setIsSendingChat(false);
    }
  }

  if (!isSignedIn) {
    return <LoginScreen onSignIn={handleSignIn} />;
  }

  const totalCards = columns.reduce((n, col) => n + col.cards.length, 0);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#f6f8fb] text-[#032147]">
      <header className="shrink-0 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-4 px-6 py-3">
          {/* Board name + switcher */}
          <div className="relative flex min-w-0 flex-1 items-center gap-2">
            <BoardNameEditor
              name={boardName}
              onRename={handleRenameBoard}
            />
            <div className="relative">
              <button
                type="button"
                aria-label="Switch board"
                onClick={() => setShowBoardMenu((v) => !v)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[#888888] hover:bg-slate-100 hover:text-[#032147] focus:outline-none focus:ring-2 focus:ring-[#209dd7]/30"
              >
                <ChevronDown size={13} aria-hidden="true" />
              </button>
              {showBoardMenu && (
                <div className="absolute left-0 top-full z-50 mt-1 w-56 border border-slate-200 bg-white shadow-lg">
                  <div className="border-b border-slate-100 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#888888]">
                      Your boards
                    </p>
                  </div>
                  <ul>
                    {boards.map((board) => (
                      <li key={board.id}>
                        <button
                          type="button"
                          onClick={() => void handleSwitchBoard(board.id)}
                          className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                            board.id === activeBoardId
                              ? "font-semibold text-[#209dd7]"
                              : "text-[#032147]"
                          }`}
                        >
                          <span className="truncate">{board.name}</span>
                          <span className="ml-2 shrink-0 text-xs text-[#888888]">
                            {board.cardCount}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-slate-100 p-2">
                    <button
                      type="button"
                      onClick={() => void handleCreateBoard()}
                      className="inline-flex w-full items-center gap-2 px-2 py-1.5 text-sm font-medium text-[#753991] hover:bg-[#753991]/5"
                    >
                      <Plus size={13} aria-hidden="true" />
                      New board
                    </button>
                  </div>
                </div>
              )}
            </div>
            {boards.length > 1 && (
              <button
                type="button"
                aria-label="Delete current board"
                onClick={() => void handleDeleteBoard()}
                className="inline-flex size-7 items-center justify-center text-slate-300 transition hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="flex shrink-0 items-center gap-3">
            <Stat label="Columns" value={columns.length} />
            <Stat label="Cards" value={totalCards} />
            <button
              type="button"
              onClick={handleLogout}
              className="h-8 border border-slate-200 bg-white px-3 text-sm font-semibold text-[#753991] transition hover:border-[#753991] hover:bg-[#753991]/5 focus:outline-none focus:ring-2 focus:ring-[#753991]/30"
            >
              Log out
            </button>
          </div>
        </div>

        {boardError ? (
          <div className="border-t border-red-100 bg-red-50 px-6 py-2">
            <p role="alert" className="text-sm font-medium text-red-700">
              {boardError}
            </p>
          </div>
        ) : null}
      </header>

      {/* Click-outside to close board menu */}
      {showBoardMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowBoardMenu(false)}
          aria-hidden="true"
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Board area */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          {isLoadingBoard ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm font-medium text-[#888888]">Loading board...</p>
            </div>
          ) : (
            <DndContext
              id="kanban-board"
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveCardId(null)}
            >
              <section
                aria-label="Kanban board"
                className="flex h-full w-max gap-4 px-6 py-5"
              >
                {columns.map((column) => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    form={forms[column.id] ?? emptyForm}
                    onFormChange={(form) =>
                      setForms((current) => ({ ...current, [column.id]: form }))
                    }
                    onAddCard={(event) => handleAddCard(column.id, event)}
                    onDeleteCard={(cardId) => {
                      if (activeBoardId !== null)
                        void runBoardMutation(() => deleteCard(activeBoardId, cardId));
                    }}
                    onUpdateCard={(cardId, updates) => {
                      if (activeBoardId !== null)
                        void runBoardMutation(() =>
                          updateCard(activeBoardId, cardId, updates.title, updates.details)
                        );
                    }}
                    onRename={(name) => {
                      if (activeBoardId !== null)
                        void runBoardMutation(() => renameColumn(activeBoardId, column.id, name));
                    }}
                    onDelete={() => {
                      if (activeBoardId !== null)
                        void runBoardMutation(() => deleteColumn(activeBoardId, column.id));
                    }}
                  />
                ))}

                {/* Add column button */}
                {activeBoardId !== null && (
                  <AddColumnButton
                    onAdd={(name) =>
                      void runBoardMutation(() => createColumn(activeBoardId, name))
                    }
                  />
                )}
              </section>

              <DragOverlay>
                {activeCard ? <CardPanel card={activeCard} isOverlay /> : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        <ChatSidebar
          messages={chatMessages}
          isSending={isSendingChat}
          error={chatError}
          onSend={handleSendChat}
        />
      </div>
    </main>
  );
}

// ─── Board name editor ────────────────────────────────────────────────────────

function BoardNameEditor({
  name,
  onRename,
}: {
  name: string;
  onRename: (name: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  const [synced, setSynced] = useState(name);

  if (name !== synced) {
    setSynced(name);
    setDraft(name);
  }

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) {
      onRename(trimmed);
    } else {
      setDraft(name);
    }
  }

  return (
    <input
      aria-label="Board name"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="min-w-0 flex-1 bg-transparent text-xl font-semibold text-[#032147] outline-none focus:ring-2 focus:ring-[#209dd7]"
    />
  );
}

// ─── Add column ───────────────────────────────────────────────────────────────

function AddColumnButton({ onAdd }: { onAdd: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function open() {
    setEditing(true);
    setName("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commit() {
    const trimmed = name.trim();
    if (trimmed) {
      onAdd(trimmed);
    }
    setEditing(false);
    setName("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") {
      setEditing(false);
      setName("");
    }
  }

  if (editing) {
    return (
      <div className="flex w-64 shrink-0 flex-col border border-[#209dd7] bg-white p-3 shadow-sm">
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          placeholder="Column name"
          aria-label="New column name"
          className="h-9 w-full border border-slate-200 px-3 text-sm font-medium text-[#032147] outline-none focus:border-[#209dd7] focus:ring-2 focus:ring-[#209dd7]/20"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={commit}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 bg-[#753991] text-xs font-semibold text-white hover:bg-[#63307b]"
          >
            <Plus size={12} aria-hidden="true" />
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setName("");
            }}
            aria-label="Cancel"
            className="inline-flex size-8 items-center justify-center text-slate-400 hover:text-[#032147]"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      aria-label="Add column"
      className="flex w-64 shrink-0 items-center justify-center gap-2 border border-dashed border-slate-300 bg-white/50 text-sm font-medium text-[#888888] transition hover:border-[#209dd7] hover:bg-white hover:text-[#209dd7]"
    >
      <Plus size={15} aria-hidden="true" />
      Add column
    </button>
  );
}

// ─── Login screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onSignIn }: { onSignIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (username === "user" && password === "password") {
      setError("");
      onSignIn();
      return;
    }
    setError("Use username user and password password.");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f8fb] px-5 text-[#032147]">
      <section className="w-full max-w-md border-t-4 border-[#ecad0a] bg-white p-8 shadow-[0_18px_50px_rgba(3,33,71,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#209dd7]">
          Project board
        </p>
        <h1 className="mt-2 text-4xl font-semibold text-[#032147]">Sign in</h1>
        <p className="mt-3 text-sm leading-6 text-[#888888]">
          Use the MVP credentials to access the Kanban board.
        </p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="text-sm font-semibold text-[#032147]" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="mt-2 h-11 w-full border border-slate-200 bg-white px-3 text-sm text-[#032147] outline-none transition focus:border-[#209dd7] focus:ring-2 focus:ring-[#209dd7]/20"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-[#032147]" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="mt-2 h-11 w-full border border-slate-200 bg-white px-3 text-sm text-[#032147] outline-none transition focus:border-[#209dd7] focus:ring-2 focus:ring-[#209dd7]/20"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm font-medium text-red-600">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center bg-[#753991] px-4 text-sm font-semibold text-white transition hover:bg-[#63307b] focus:outline-none focus:ring-2 focus:ring-[#753991]/40"
          >
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}

// ─── Stat chip ────────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-l-2 border-[#ecad0a] bg-slate-50 px-3 py-1.5">
      <p className="text-xs font-medium text-[#888888]">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-[#032147]">{value}</p>
    </div>
  );
}

// ─── Chat sidebar ─────────────────────────────────────────────────────────────

function ChatSidebar({
  messages,
  isSending,
  error,
  onSend,
}: {
  messages: ChatMessage[];
  isSending: boolean;
  error: string;
  onSend: (message: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isSending) return;
    setDraft("");
    onSend(message);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const message = draft.trim();
      if (!message || isSending) return;
      setDraft("");
      onSend(message);
    }
  }

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-slate-200 bg-white shadow-[-4px_0_20px_rgba(3,33,71,0.06)]">
      <header className="shrink-0 border-t-4 border-[#209dd7] px-4 pb-3 pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#753991]">
          AI assistant
        </p>
        <h2 className="mt-1 text-xl font-semibold text-[#032147]">Board chat</h2>
        <p className="mt-1 text-xs leading-5 text-[#888888]">
          Ask the AI to create, edit, move, or delete cards.
        </p>
      </header>

      <div
        aria-label="AI conversation"
        className="flex flex-1 flex-col gap-3 overflow-y-auto bg-slate-50 p-4"
      >
        {messages.length === 0 ? (
          <p className="text-sm leading-6 text-[#888888]">
            Try: Add a card to Backlog for drafting release notes.
          </p>
        ) : null}
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`rounded-sm px-3 py-2 text-sm leading-6 ${
              message.role === "user"
                ? "ml-6 bg-[#032147] text-white"
                : "mr-6 border border-slate-200 bg-white text-[#032147]"
            }`}
          >
            {message.content}
          </div>
        ))}
        {isSending ? (
          <p className="text-sm font-medium text-[#888888]">AI is thinking...</p>
        ) : null}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="shrink-0 space-y-2 border-t border-slate-200 p-4">
        {error ? (
          <p role="alert" className="text-sm font-medium text-red-600">
            {error}
          </p>
        ) : null}
        <label className="sr-only" htmlFor="ai-message">
          Message AI assistant
        </label>
        <textarea
          id="ai-message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the AI to update the board... (Enter to send)"
          rows={3}
          className="w-full resize-none border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-[#032147] outline-none transition placeholder:text-slate-400 focus:border-[#209dd7] focus:ring-2 focus:ring-[#209dd7]/20"
        />
        <button
          type="submit"
          disabled={!draft.trim() || isSending}
          className="inline-flex h-9 w-full items-center justify-center gap-2 bg-[#753991] px-3 text-sm font-semibold text-white transition hover:bg-[#63307b] focus:outline-none focus:ring-2 focus:ring-[#753991]/40 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <Send size={14} aria-hidden="true" />
          Send
        </button>
      </form>
    </aside>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  form,
  onFormChange,
  onAddCard,
  onDeleteCard,
  onUpdateCard,
  onRename,
  onDelete,
}: {
  column: BoardColumn;
  form: { title: string; details: string };
  onFormChange: (form: { title: string; details: string }) => void;
  onAddCard: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteCard: (cardId: string) => void;
  onUpdateCard: (cardId: string, updates: Pick<Card, "title" | "details">) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [name, setName] = useState(column.name);
  const [syncedName, setSyncedName] = useState(column.name);

  if (column.name !== syncedName) {
    setSyncedName(column.name);
    setName(column.name);
  }

  function commitName() {
    if (name !== column.name) onRename(name);
  }

  return (
    <article
      ref={setNodeRef}
      data-testid={`column-${column.id}`}
      className={`flex w-64 shrink-0 flex-col border border-slate-200 bg-white shadow-[0_4px_20px_rgba(3,33,71,0.07)] transition ${
        isOver ? "ring-2 ring-[#209dd7]" : ""
      }`}
    >
      <header className="group shrink-0 border-t-4 border-[#ecad0a] px-3 pb-2 pt-3">
        <div className="flex items-center gap-1">
          <input
            aria-label={`${name} column name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            className="flex-1 bg-transparent text-sm font-semibold text-[#032147] outline-none focus:ring-2 focus:ring-[#209dd7]"
          />
          <button
            type="button"
            aria-label={`Delete ${name} column`}
            onClick={onDelete}
            className="inline-flex size-6 shrink-0 items-center justify-center text-slate-300 opacity-0 transition hover:text-red-500 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-200 group-hover:opacity-100"
          >
            <Trash2 size={12} aria-hidden="true" />
          </button>
        </div>
        <p className="mt-0.5 text-xs font-medium text-[#888888]">
          {column.cards.length} {column.cards.length === 1 ? "card" : "cards"}
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-2">
        {column.cards.map((card) => (
          <DraggableCard
            key={card.id}
            card={card}
            onDelete={() => onDeleteCard(card.id)}
            onUpdate={(updates) => onUpdateCard(card.id, updates)}
          />
        ))}
      </div>

      <form onSubmit={onAddCard} className="shrink-0 border-t border-slate-200 bg-slate-50 p-3">
        <label className="sr-only" htmlFor={`${column.id}-title`}>
          Card title
        </label>
        <input
          id={`${column.id}-title`}
          placeholder="Card title"
          value={form.title}
          onChange={(e) => onFormChange({ ...form, title: e.target.value })}
          className="h-9 w-full border border-slate-200 bg-white px-3 text-sm font-medium text-[#032147] outline-none transition placeholder:text-slate-400 focus:border-[#209dd7] focus:ring-2 focus:ring-[#209dd7]/20"
        />
        <label className="sr-only" htmlFor={`${column.id}-details`}>
          Card details
        </label>
        <textarea
          id={`${column.id}-details`}
          placeholder="Details"
          value={form.details}
          onChange={(e) => onFormChange({ ...form, details: e.target.value })}
          rows={2}
          className="mt-2 w-full resize-none border border-slate-200 bg-white px-3 py-2 text-sm text-[#032147] outline-none transition placeholder:text-slate-400 focus:border-[#209dd7] focus:ring-2 focus:ring-[#209dd7]/20"
        />
        <button
          type="submit"
          className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 bg-[#753991] px-3 text-sm font-semibold text-white transition hover:bg-[#63307b] focus:outline-none focus:ring-2 focus:ring-[#753991]/40"
        >
          <Plus size={14} aria-hidden="true" />
          Add card
        </button>
      </form>
    </article>
  );
}

// ─── Draggable card ───────────────────────────────────────────────────────────

function DraggableCard({
  card,
  onDelete,
  onUpdate,
}: {
  card: Card;
  onDelete: () => void;
  onUpdate: (updates: Pick<Card, "title" | "details">) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={isDragging ? "opacity-40" : ""}
    >
      <CardPanel
        card={card}
        dragAttributes={attributes}
        dragListeners={listeners}
        onDelete={onDelete}
        onUpdate={onUpdate}
      />
    </div>
  );
}

// ─── Card panel ───────────────────────────────────────────────────────────────

function CardPanel({
  card,
  dragAttributes,
  dragListeners,
  onDelete,
  onUpdate,
  isOverlay = false,
}: {
  card: Card;
  dragAttributes?: DragAttributes;
  dragListeners?: DragListeners;
  onDelete?: () => void;
  onUpdate?: (updates: Pick<Card, "title" | "details">) => void;
  isOverlay?: boolean;
}) {
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [syncedTitle, setSyncedTitle] = useState(card.title);
  const [syncedDetails, setSyncedDetails] = useState(card.details);

  if (card.title !== syncedTitle) {
    setSyncedTitle(card.title);
    setTitle(card.title);
  }

  if (card.details !== syncedDetails) {
    setSyncedDetails(card.details);
    setDetails(card.details);
  }

  function commit() {
    if (onUpdate && (title !== card.title || details !== card.details)) {
      onUpdate({ title, details });
    }
  }

  return (
    <div
      data-testid={`card-${card.id}`}
      className={`group border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow-md ${
        isOverlay ? "w-64 shadow-2xl" : ""
      }`}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          aria-label={`Drag ${card.title}`}
          className="mt-0.5 inline-flex size-6 shrink-0 cursor-grab items-center justify-center text-slate-300 hover:text-[#209dd7] active:cursor-grabbing"
          {...dragAttributes}
          {...dragListeners}
        >
          <GripVertical size={15} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          {onUpdate ? (
            <>
              <label className="sr-only" htmlFor={`${card.id}-title`}>
                {title} card title
              </label>
              <input
                id={`${card.id}-title`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={commit}
                className="w-full bg-transparent text-sm font-semibold leading-5 text-[#032147] outline-none focus:ring-2 focus:ring-[#209dd7]"
              />
              <label className="sr-only" htmlFor={`${card.id}-details`}>
                {title} card details
              </label>
              <textarea
                id={`${card.id}-details`}
                value={details}
                placeholder="Details"
                onChange={(e) => setDetails(e.target.value)}
                onBlur={commit}
                rows={2}
                className="mt-1 w-full resize-none bg-transparent text-xs leading-5 text-[#888888] outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-[#209dd7]"
              />
            </>
          ) : (
            <>
              <h2 className="text-sm font-semibold leading-5 text-[#032147]">{card.title}</h2>
              {card.details ? (
                <p className="mt-1 text-xs leading-5 text-[#888888]">{card.details}</p>
              ) : null}
            </>
          )}
        </div>
        {onDelete ? (
          <button
            type="button"
            aria-label={`Delete ${card.title}`}
            onClick={onDelete}
            className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center text-slate-300 opacity-0 transition hover:text-red-500 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-200 group-hover:opacity-100"
          >
            <Trash2 size={13} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
