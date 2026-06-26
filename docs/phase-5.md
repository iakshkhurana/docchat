# Phase 5 — Polish & Ship (how it was built)

Goal: take the working pipeline to production-ready — source citations, consistent deletes, error handling, rate limiting, CI, and a containerized deploy.

---

## What was built

### Source citations
The chat route now streams the retrieved chunks' **page numbers** alongside the answer, and the UI renders them under each reply.

- **Logic / flow:** after retrieval, build `sources = chunks.map((c, i) => ({ n: i+1, page: c.page }))`. The route uses `createUIMessageStream` to first `writer.write({ type: "data-sources", data: sources })`, then `writer.merge(streamText(...).toUIMessageStream())`. So the client receives a `data-sources` part plus the streamed text.
- **Client:** `chat-panel` reads the `data-sources` part, de-dupes pages, and renders `Sources p.1 p.3` chips under the answer.
- **Cache:** the answer cache now stores `JSON.stringify({ text, sources })`, so a cache HIT also shows citations (legacy plain-string entries still work).

### Delete (consistency-critical)
`DELETE /api/documents/[id]` fans out to **all three stores** — Chroma vectors, Redis answer cache (`ans:<id>:*`), then Postgres (cascades Messages). Ownership is checked first. Triggered from the UI via a custom confirm modal.

### Error handling
- Worker wraps ingestion in try/catch → on failure sets status `failed` + the reason in `error`; resilient to mid-flight document deletion.
- The dashboard shows a **Failed** badge with the reason on hover (`title`).
- The chat surfaces a red banner when a response fails.

### Rate limiting
`POST /api/chat` does `INCR ratelimit:<userId>` with a 60s expiry; over **20 messages/min** returns `429`.

### CI
`.github/workflows/ci.yml` runs on every push/PR: `npm ci` → `prisma generate` → `lint` → `build`. Uses dummy `DATABASE_URL`/`AUTH_SECRET` (build and lint never connect to a service).

> GitHub Actions only reads `.github/workflows/` from the **repository root**, so the workflow assumes the `docchat/` app folder is the repo root.

### Deploy (containerized)
- `Dockerfile` — one image for both the app and the worker; they differ only by entrypoint (`npm run start` vs `npm run worker`). Multi-stage: deps → build (`prisma generate` + `next build`) → runtime.
- `.dockerignore` keeps `node_modules`, `.next`, `.env`, and `uploads` out of the build context.
- `docker-compose.yml` (from Phase 0) wires app + worker + postgres + chromadb + redis.

---

## Verify (Done-when proof)
End-to-end with infra + `npm run dev`:
- Upload → `ready` → ask a question → answer streams with **`Sources p.N`** chips (confirmed: stream carries a `data-sources` part with `"page":1`).
- Delete a document → removed from Postgres + Chroma + Redis.
- A failed ingestion shows the reason on its badge.

## Notes / choices
| Topic | Choice | Why |
|---|---|---|
| Citation transport | `data-sources` UI-message part via `createUIMessageStream` + `merge` | sends structured sources alongside the streamed text, no extra request |
| Cache shape | `{ text, sources }` JSON | cached replies keep their citations |
| Rate limit | per-user Redis counter, 20/min | simple, stateless, matches the architecture's `ratelimit:<userId>` key |
| One Docker image | app & worker share it, differ by entrypoint | smaller build, identical runtime — matches the topology |
