<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Frontend Notes

This frontend is a Next.js 16 app using React 19, TypeScript, Tailwind CSS 4, `@dnd-kit` for drag and drop, and `lucide-react` for icons.

## Current Structure

- `src/app/page.tsx` is the client-side Kanban page. It owns in-memory board state, renders the fixed board columns, and handles column renaming, card creation, card editing, card deletion, and drag-and-drop card movement.
- `src/lib/board.ts` contains the board types, initial demo data, and pure state helpers: `renameColumn`, `addCard`, `updateCard`, `deleteCard`, and `moveCard`.
- `src/lib/board.test.ts` contains Vitest tests for the board helpers.
- `tests/kanban.spec.ts` contains Playwright tests for the visible Kanban flow.
- `playwright.config.ts` starts the dev server on `127.0.0.1:3100` for browser tests.

## Commands

- `npm run dev` starts the Next.js development server with webpack. Keep webpack enabled unless Turbopack is proven stable locally.
- `npm run build` builds the frontend.
- `npm run lint` runs ESLint.
- `npm run test` runs Vitest unit tests.
- `npm run serve:static` serves the exported `out/` directory for static checks.
- `npm run test:e2e` runs Playwright tests.

## Implementation Notes

- Keep board mutations in pure helpers where practical, then call those helpers from UI state or API integration code.
- Preserve the MVP color scheme from the root `AGENTS.md`.
- Keep auth frontend-only until backend persistence is introduced.
- When changing Next.js behavior, check `node_modules/next/dist/docs/` first because this project uses Next.js 16.
