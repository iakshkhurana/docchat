# Phase 1 — Data Layer (how it was built)

Goal: thin, tested clients for three stores (Postgres, Chroma, Redis) — no business logic yet. Each file does exactly one thing.

> Prisma 7 and Next 16 are both newer than the training data, so a few places differ from plan.md (see "Gotchas" below).

---

## Files & logic

### `prisma/schema.prisma` + `prisma.config.ts`
Two tables: **Document** (a record per uploaded file — `status`, `chunkCount`, `error`) and **Message** (chat history, cascade-deleted with its `Document`).

- **Logic:** `status` is a simple string state machine — `queued → processing → ready` (or `failed`). The worker advances it.
- **Prisma 7 gotcha:** `url` is no longer allowed in `schema.prisma`. The connection string lives in `prisma.config.ts`, where `dotenv` loads `.env` and supplies `DATABASE_URL`.

### `lib/db.ts` — Prisma client (singleton)
Creates and exports a single `PrismaClient` instance.

- **Logic — why a singleton:** Next.js hot-reloads code in dev. Making a new client on every reload would exhaust DB connections, so we cache it on `globalThis` and reuse one client.
- **Prisma 7 gotcha:** plain `new PrismaClient()` no longer works — it needs a **driver adapter**. So we build a `PrismaPg` adapter from `@prisma/adapter-pg` (+ `pg`) and pass it in.

### `lib/redis.ts` — Redis connection
One `ioredis` connection. `maxRetriesPerRequest: null` is **required** by BullMQ (Phase 2).

### `lib/chroma.ts` — vector store client
ChromaClient plus a `getCollection()` that gets/creates the `docchat_chunks` collection.

- **Logic — why `embeddingFunction: null`:** we build vectors ourselves (via our `embed()`) and hand Chroma ready-made ones. Setting `null` tells Chroma "don't embed text yourself." Otherwise it looks for its own default model and throws a warning/error.
- **Gotcha:** the `path` option is deprecated — we split `CHROMA_URL` into `host`/`port`/`ssl`.

### `lib/embeddings.ts` — cache-aware `embed(text)`
Turns text into a number-vector, **through a Redis cache**.

- **Logic:** take the `sha256` hash of the text → key `emb:<hash>`. Check Redis first — on a hit, return it (no API call). On a miss, call OpenAI `text-embedding-3-small` and cache the result for 30 days. Re-embedding the same text later is free.
- **Quality lever:** chunks and questions must use the **same** model — otherwise similarity matching goes wrong.

### `lib/chunking.ts` — `chunk(pages)` (pure function)
Splits a long document into ~800-char pieces with ~100-char overlap.

- **Logic — why overlap:** each window slides forward by `step = size - overlap`. The overlap means if a sentence is cut at a chunk boundary, the next chunk still carries its context. Every chunk is tagged with its `page` number — used later for citations ("from page 3").
- **Pure** = same input → same output, no DB/network. That makes it easy to test.

---

## Verify (Done-when proof)
`scripts/verify-phase1.ts` is a throwaway script: insert a Document → upsert + query a vector in Chroma → Redis set/get → chunking sanity check → cleanup. All pass = Phase 1 green.

```bash
npx tsx scripts/verify-phase1.ts
```

## Gotchas summary (plan.md vs reality)
| Plan said | Phase 1 actually used | Why |
|---|---|---|
| `datasource { url }` in schema | url in `prisma.config.ts` | Prisma 7 breaking change |
| `new PrismaClient()` | `+ PrismaPg` adapter | Prisma 7 driver adapter is mandatory |
| `new ChromaClient({ path })` | `{ host, port, ssl }` + `embeddingFunction: null` | `path` deprecated; we embed ourselves |
