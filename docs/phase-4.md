# Phase 4 — Frontend (how it was built)

Goal: the whole system usable in a browser — a marketing landing page plus a dashboard where you upload PDFs, watch them index live, and chat with streaming answers.

> The UI follows the two attached design references: a light landing page and a dark 3-column dashboard.

---

## Routes & files

### `app/page.tsx` — landing page (`/`)
A light, marketing-style hero (Server Component). Headline, sub-copy, CTAs into the app, and a small product preview card. Pure presentation — every CTA links to `/app`.

### `app/api/documents/route.ts` — list endpoint
`GET /api/documents` → all documents (newest first) with `id, filename, status, chunkCount, createdAt`. This feeds the knowledge-base list and the live-status polling.

### `app/app/page.tsx` — dashboard (`/app`, Client Component)
A 3-column grid matching the design:

1. **Sidebar** — branding + workspace/projects nav (mostly decorative for now).
2. **Knowledge column** — the **upload** drop zone (click *or* drag-and-drop → `POST /api/upload`) and the **Knowledge Base** file list.
3. **Chat column** — the `ChatPanel`.

- **Live status:** `GET /api/documents` is polled every 3s, so a freshly uploaded file moves `Queued → Processing → Indexed` on screen without a refresh.
- **Status badges:** `ready → Indexed` (green), `processing/queued → Processing` (amber), `failed → Failed` (red).
- **Selection:** clicking a document sets it as the chat context; the first `ready` doc is auto-selected.

### `app/app/chat-panel.tsx` — streaming chat (Client Component)
Uses the Vercel AI SDK `useChat` against `/api/chat`.

- **Logic:** local `input` state; on submit, `sendMessage({ text }, { body: { documentId } })` — the selected document id rides along in the request body so the API knows which doc to search.
- **Streaming:** messages render from `useChat`'s `messages` (each is a `UIMessage` with `parts`); assistant text streams in token-by-token. `status` drives a "Thinking…" indicator and disables the composer while busy.
- **Gating:** the composer is disabled until a `ready` document is selected — you can't chat with a doc that isn't indexed yet.
- **Reset on switch:** the panel is keyed by `documentId` in the parent, so switching documents remounts a fresh chat.

---

## Verify (Done-when proof)
With infra + worker + dev server running:

```bash
npm run dev        # app
npm run worker     # ingestion worker
# open http://localhost:3000  → landing → "Open the app" → /app
```

Smoke-tested: `/` and `/app` both return 200, `/api/documents` lists documents, the landing renders the hero, and the dashboard renders the upload + knowledge base. The full upload → Indexed → chat loop needs a valid `OPENAI_API_KEY` (embeddings + LLM).

## Notes / choices
| Topic | Choice | Why |
|---|---|---|
| App routes | `/` landing, `/app` dashboard | marketing vs product, cleanly separated |
| Passing `documentId` | `sendMessage(msg, { body })` | per-message body merge — no transport rebuild on doc switch |
| Live updates | 3s polling of `/api/documents` | simplest reliable status; SSE over `progress:<docId>` is a later upgrade |
| Styling | Tailwind v4 + explicit dark palette | matches the dark dashboard reference without a theme system |
| useChat reset | `key={documentId}` on the panel | clean per-document conversations |
