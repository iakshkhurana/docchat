# Phase 2 — Ingestion Worker (how it was built)

Goal: uploading a file ends with indexed vectors and status `ready` — fully async. The HTTP request stays fast; all the slow work (parse, embed) happens in a separate worker process.

> The core idea: the upload route and the worker are **two processes** that only talk through the Redis queue. The app never parses or embeds inside a request.

---

## Files & logic

### `lib/queue.ts` — the queue (producer)
A single BullMQ `Queue` named `"ingest"`, sharing the Redis `connection` from Phase 1.

- **Logic:** this is only the *producer* side — the upload route pushes jobs here. The worker (a separate process) is the *consumer*.
- **Retries:** `attempts: 3` + exponential backoff. If embedding or Chroma is briefly down, the job retries instead of dying. `removeOnComplete/Fail` keep Redis from filling up with old jobs.
- `IngestJob` type (`{ documentId, filePath }`) is shared between producer and worker so the payload stays in sync.

### `app/api/upload/route.ts` — intake (thin)
Handles `POST /api/upload`. Does the *minimum* and returns immediately.

- **Logic / flow:** read the multipart `file` → save it to `uploads/` (random filename, keep extension) → `INSERT Document (status="queued")` → `ingestQueue.add(...)` → return **202 Accepted** with the document id.
- **Why 202, not 200:** the work isn't done yet — it's *accepted and queued*. The client polls the status afterwards. No parsing/embedding here, so the request returns in milliseconds.

### `worker/index.ts` — the consumer (separate process)
A standalone BullMQ `Worker` (`npm run worker`) that processes one job at a time (×2 concurrency). For each job:

1. status → `processing`
2. **parse** — `unpdf` extracts text, one string per page (`mergePages: false`)
3. **chunk** — Phase 1's `chunk()` → ~800-char pieces, each tagged with its page
4. **embed** — each chunk through the cached `embed()` (Redis-backed)
5. **upsert** to Chroma — `id = "<documentId>:<chunkIndex>"`, with `metadata { documentId, chunkIndex, page }`
6. status → `ready`, `chunkCount = n`

- **Error handling:** the whole body is wrapped in try/catch. On any throw → status `failed` + the message saved in `error`, then re-throw so BullMQ records the failure and retries.
- **Why a separate process:** parsing + embedding a big PDF can take many seconds. Running it in the worker keeps the app tier fast and lets ingestion scale independently.

---

## Verify (Done-when proof)
End-to-end with the infra + worker + dev server running:

```bash
npm run dev        # terminal 1 — app
npm run worker     # terminal 2 — ingestion worker
# then upload a PDF (browser or curl) to /api/upload
```

What was confirmed:
- `POST /api/upload` returns **202** instantly with `status: "queued"`
- the worker picks the job up → status flips to `processing`
- on a bad embedding key, status correctly became `failed` with the error recorded (proves the failure path)
- with a valid `OPENAI_API_KEY`, the run completes to `ready` with `chunkCount` set and vectors in Chroma

> Needs a real `OPENAI_API_KEY` in `.env` — the embed step calls OpenAI. A placeholder key makes the job land in `failed` (by design).

## Notes / choices
| Topic | Choice | Why |
|---|---|---|
| PDF parser | `unpdf` | lightweight, no native deps; gives per-page text → clean page citations |
| File storage | local `uploads/` dir | app and worker share the filesystem in dev; gitignored |
| Chroma id | `"<docId>:<chunkIndex>"` | stable, unique per chunk; lets delete/scope by document |
| Concurrency | `2` | process a couple of docs at once without hammering the embedding API |
