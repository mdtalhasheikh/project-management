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
import { GripVertical, Plus, Send, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Board,
  ChatMessage,
  createCard,
  deleteCard,
  fetchBoard,
  moveCard,
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
  const [boardName, setBoardName] = useState("Product Launch");
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [forms, setForms] = useState<CardFormState>({});
  const [isLoadingBoard, setIsLoadingBoard] = useState(false);
  const [boardError, setBoardError] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatError, setChatError] = useState("");

  function applyBoard(board: Board) {
    setBoardName(board.name);
    setColumns(board.columns);
    setForms((current) => ({
      ...Object.fromEntries(
        board.columns.map((column) => [column.id, current[column.id] ?? emptyForm]),
      ),
    }));
  }

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    async function loadBoard() {
      setIsLoadingBoard(true);
      setBoardError("");
      try {
        applyBoard(await fetchBoard());
      } catch {
        setBoardError("Could not load the board. Please try again.");
      } finally {
        setIsLoadingBoard(false);
      }
    }

    void loadBoard();
  }, [isSignedIn]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const cardsById = useMemo(() => {
    return new Map(columns.flatMap((column) => column.cards.map((card) => [card.id, card])));
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
      setBoardError("Could not save the board change. Please try again.");
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const overId = event.over?.id;
    if (overId) {
      void runBoardMutation(() => moveCard(String(event.active.id), String(overId)));
    }
    setActiveCardId(null);
  }

  function handleAddCard(columnId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = forms[columnId] ?? emptyForm;
    void runBoardMutation(() => createCard(columnId, form.title, form.details));
    setForms((current) => ({ ...current, [columnId]: emptyForm }));
  }

  function handleSignIn() {
    setSession(true);
  }

  function handleLogout() {
    setSession(false);
    setColumns([]);
    setForms({});
    setBoardError("");
    setChatMessages([]);
    setChatError("");
  }

  async function handleSendChat(message: string) {
    const userMessage: ChatMessage = { role: "user", content: message };
    const history = chatMessages;
    setChatMessages((current) => [...current, userMessage]);
    setIsSendingChat(true);
    setChatError("");

    try {
      const response = await sendChatMessage(message, history);
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

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#f6f8fb] text-[#032147]">
      <header className="shrink-0 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-6 px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#209dd7]">
              Project board
            </p>
            <h1 className="mt-0.5 truncate text-2xl font-semibold text-[#032147]">{boardName}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-5">
            <div className="flex gap-3">
              <Stat label="Columns" value={columns.length} />
              <Stat
                label="Cards"
                value={columns.reduce((total, column) => total + column.cards.length, 0)}
              />
              <Stat label="Board" value="MVP" />
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="h-9 border border-slate-200 bg-white px-4 text-sm font-semibold text-[#753991] transition hover:border-[#753991] hover:bg-[#753991]/5 focus:outline-none focus:ring-2 focus:ring-[#753991]/30"
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

      <div className="flex flex-1 overflow-hidden">
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
                    onDeleteCard={(cardId) =>
                      void runBoardMutation(() => deleteCard(cardId))
                    }
                    onUpdateCard={(cardId, updates) =>
                      void runBoardMutation(() =>
                        updateCard(cardId, updates.title, updates.details)
                      )
                    }
                    onRename={(name) =>
                      void runBoardMutation(() => renameColumn(column.id, name))
                    }
                  />
                ))}
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
              onChange={(event) => setUsername(event.target.value)}
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
              onChange={(event) => setPassword(event.target.value)}
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-l-2 border-[#ecad0a] bg-slate-50 px-3 py-1.5">
      <p className="text-xs font-medium text-[#888888]">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-[#032147]">{value}</p>
    </div>
  );
}

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
    if (!message || isSending) {
      return;
    }
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
          onChange={(event) => setDraft(event.target.value)}
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

function KanbanColumn({
  column,
  form,
  onFormChange,
  onAddCard,
  onDeleteCard,
  onUpdateCard,
  onRename,
}: {
  column: BoardColumn;
  form: { title: string; details: string };
  onFormChange: (form: { title: string; details: string }) => void;
  onAddCard: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteCard: (cardId: string) => void;
  onUpdateCard: (cardId: string, updates: Pick<Card, "title" | "details">) => void;
  onRename: (name: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [name, setName] = useState(column.name);
  const [syncedName, setSyncedName] = useState(column.name);

  if (column.name !== syncedName) {
    setSyncedName(column.name);
    setName(column.name);
  }

  function commitName() {
    if (name !== column.name) {
      onRename(name);
    }
  }

  return (
    <article
      ref={setNodeRef}
      data-testid={`column-${column.id}`}
      className={`flex w-64 shrink-0 flex-col border border-slate-200 bg-white shadow-[0_4px_20px_rgba(3,33,71,0.07)] transition ${
        isOver ? "ring-2 ring-[#209dd7]" : ""
      }`}
    >
      <header className="shrink-0 border-t-4 border-[#ecad0a] px-4 pb-3 pt-4">
        <input
          aria-label={`${name} column name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          className="w-full bg-transparent text-base font-semibold text-[#032147] outline-none focus:ring-2 focus:ring-[#209dd7]"
        />
        <p className="mt-1 text-xs font-medium text-[#888888]">
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
          onChange={(event) => onFormChange({ ...form, title: event.target.value })}
          className="h-9 w-full border border-slate-200 bg-white px-3 text-sm font-medium text-[#032147] outline-none transition placeholder:text-slate-400 focus:border-[#209dd7] focus:ring-2 focus:ring-[#209dd7]/20"
        />
        <label className="sr-only" htmlFor={`${column.id}-details`}>
          Card details
        </label>
        <textarea
          id={`${column.id}-details`}
          placeholder="Details"
          value={form.details}
          onChange={(event) => onFormChange({ ...form, details: event.target.value })}
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
        isOverlay ? "w-72 shadow-2xl" : ""
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
                onChange={(event) => setTitle(event.target.value)}
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
                onChange={(event) => setDetails(event.target.value)}
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
