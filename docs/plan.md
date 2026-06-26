# DocChat — Build Plan

Phased plan to build the system described in [architecture.md](architecture.md), from empty repo to working RAG app. Five services, two planes, built bottom-up so each phase is verifiable before the next.

> **Stack:** Next.js (App Router) · Prisma + Postgres · ChromaDB · Redis + BullMQ · Docker
> **Approach:** build the pipeline backwards-to-front — infra first, then ingestion, then retrieval, then UI. Verify at every phase.

---

## Table of Contents

1. [Build Order & Rationale](#1-build-order--rationale)
2. [Phase 0 — Project & Infra](#phase-0--project--infra)
3. [Phase 1 — Data Layer](#phase-1--data-layer)
4. [Phase 2 — Ingestion Worker](#phase-2--ingestion-worker)
5. [Phase 3 — Retrieval & Chat](#phase-3--retrieval--chat)
6. [Phase 4 — Frontend](#phase-4--frontend)
7. [Phase 5 — Polish & Ship](#phase-5--polish--ship)
8. [Project Structure](#project-structure)
9. [Setup & Running](#setup--running)
10. [Environment Variables](#environment-variables)
11. [Tech Choices Reference](#tech-choices-reference)

---

## 1. Build Order & Rationale

Build along the **data flow**, not the user flow. Infra and ingestion first, because there's nothing to retrieve until data is indexed; UI last, because it's just a view over a working pipeline.

| Phase | Builds | Verifiable when |
|-------|--------|-----------------|
| 0 | Repo + 5 Docker services | all containers `Up`, health checks pass |
| 1 | Prisma schema, Chroma client, Redis client | can read/write each store from a script |
| 2 | Queue + ingestion worker | upload a file → vectors land in Chroma, status `ready` |
| 3 | Retrieval + chat API (streaming) | ask a question → correct streamed answer |
| 4 | Upload UI + chat UI | full flow works in the browser |
| 5 | Citations, caching, errors, CI, deploy | production-ready |

Each phase is independently testable. Don't start a phase until the previous one is green.

---

## Phase 0 — Project & Infra

**Goal:** all five services run and talk to each other.

1. Scaffold Next.js (App Router, TypeScript):
   ```bash
   npx create-next-app@latest docchat --ts --app
   ```
2. Install dependencies:
   ```bash
   npm install @prisma/client chromadb bullmq ioredis ai
   npm install -D prisma tsx
   ```
3. Write `docker-compose.yml` with all five services (see [Setup & Running](#setup--running)).
4. `docker-compose up -d` and verify each:
   ```bash
   docker-compose ps                                  # all Up
   curl http://localhost:8000/api/v2/heartbeat        # ChromaDB
   docker-compose exec redis redis-cli ping           # Redis → PONG
   docker-compose exec postgres pg_isready            # Postgres
   ```

**Done when:** every container is healthy and reachable from the host.

---

## Phase 1 — Data Layer

**Goal:** thin, tested clients for each store. No business logic yet.

1. **Prisma** — define `Document` + `Message` ([architecture.md §6](architecture.md#6-data-model)), then:
   ```bash
   npx prisma migrate dev --name init
   ```
   - `lib/db.ts` → singleton Prisma client.
2. **ChromaDB** — `lib/chroma.ts`:
   ```ts
   import { ChromaClient } from "chromadb";
   export const chroma = new ChromaClient({ path: process.env.CHROMA_URL });
   export const getCollection = () =>
     chroma.getOrCreateCollection({ name: "docchat_chunks" });
   ```
3. **Redis** — `lib/redis.ts`:
   ```ts
   import IORedis from "ioredis";
   export const connection = new IORedis(process.env.REDIS_URL!, {
     maxRetriesPerRequest: null,        // required by BullMQ
   });
   ```
4. **Embeddings** — `lib/embeddings.ts`: a cache-aware `embed(text)` that checks `emb:<hash>` in Redis before calling the API.
5. **Chunking** — `lib/chunking.ts`: pure function, ~800 chars with ~100 overlap, returns `{ text, page }[]`.

**Done when:** a throwaway script can write a Document, upsert a vector, and set/get a Redis key.

---

## Phase 2 — Ingestion Worker

**Goal:** uploading a file ends with indexed vectors and status `ready` — fully async.

1. **Queue (producer)** — `lib/queue.ts`:
   ```ts
   import { Queue } from "bullmq";
   import { connection } from "./redis";
   export const ingestQueue = new Queue("ingest", { connection });
   ```
2. **Upload route** — `app/api/upload/route.ts` (thin):
   - save file → `INSERT Document (status="queued")` → `ingestQueue.add("ingest", { documentId, filePath })` → return **202**. No parsing here.
3. **Worker** — `worker/index.ts` (standalone process):
   ```ts
   import { Worker } from "bullmq";
   import { connection } from "../lib/redis";
   new Worker("ingest", async (job) => {
     const { documentId, filePath } = job.data;
     // status → processing
     // parse → chunk → embed (cached) → collection.upsert(...)
     // status → ready, chunkCount = n
     // (optional) publish progress:<documentId>
   }, { connection, concurrency: 2 });
   ```
   - On throw: catch → status `failed` + `error`.
4. Add `"worker": "tsx worker/index.ts"` to `package.json` scripts.

**Done when:** `POST /api/upload` returns instantly, the worker logs processing, vectors appear in Chroma, and status reaches `ready`. Kill the worker mid-job → BullMQ retries on restart.

---

## Phase 3 — Retrieval & Chat

**Goal:** ask a question over an indexed document, get a correct streamed answer.

1. **Retrieval** — `lib/retrieval.ts`:
   ```ts
   const res = await collection.query({
     queryEmbeddings: [await embed(question)],
     nResults: 5,
     where: { documentId },
   });
   // res.documents[0] = chunk texts, res.metadatas[0] = citations
   ```
   - Verify first by `console.log`ging retrieved chunks — confirm they're the *right* ones before wiring the LLM.
2. **Chat route** — `app/api/chat/route.ts`:
   - answer-cache check (`ans:<docId>:<hash(q)>`) → HIT returns cached.
   - MISS → retrieve top-5 → build prompt → **stream** LLM response (Vercel AI SDK).
   - on completion → cache answer (short TTL) + persist user/assistant Messages.

**Done when:** a question returns a correct, streamed answer grounded in the document; a repeat question is served instantly from cache with no new API calls.

---

## Phase 4 — Frontend

**Goal:** the whole system usable in a browser.

1. **Document list / upload** — `app/page.tsx`: upload control, list of documents with live status (poll `status`, or SSE on `progress:<docId>`).
2. **Chat view** — `app/chat/[id]/page.tsx`: Vercel AI SDK `useChat` against `/api/chat`, streaming bubbles.
3. **Loading & status** — "processing" state while the worker runs; disable chat until `ready`.

**Done when:** upload a PDF in the browser → watch it become `ready` → chat with it, answers streaming token-by-token.

---

## Phase 5 — Polish & Ship

**Goal:** production-ready.

- **Source citations** — render page/chunk from Chroma metadata under each answer.
- **Delete** — `DELETE /api/documents/:id` fans out to Postgres + Chroma + Redis ([architecture.md §5.3](architecture.md#53-delete-consistency-critical)).
- **Error handling** — corrupt/empty PDF, embedding failure, Chroma/Redis down → clear user-facing messages.
- **Rate limiting** (optional) — `INCR ratelimit:<userId>` + `EXPIRE 60`.
- **CI** — GitHub Actions: lint + build + `prisma generate` on push.
- **Deploy** — containers to a host (or app on Vercel + managed Postgres/Redis/Chroma); worker as its own always-on service.
- **README** — screenshots + the setup below.

**Done when:** clean upload→chat→cite→delete cycle, errors handled, CI green, deployed.

---

## Project Structure

```
docchat/
├── docker-compose.yml          # app, worker, postgres, chromadb, redis
├── Dockerfile                  # one image; app & worker differ by entrypoint
├── .env.example
├── prisma/
│   └── schema.prisma           # Document, Message
├── app/
│   ├── page.tsx                # document list + upload
│   ├── chat/[id]/page.tsx      # streaming chat per document
│   └── api/
│       ├── upload/route.ts     # thin: save + enqueue, return 202
│       ├── chat/route.ts       # cache → retrieve → LLM stream → persist
│       ├── documents/[id]/route.ts  # DELETE → fan out to all 3 stores
│       └── progress/route.ts   # (optional) SSE over Redis pub-sub
├── worker/
│   └── index.ts                # BullMQ consumer: parse→chunk→embed→chroma
├── lib/
│   ├── db.ts                   # Prisma client
│   ├── redis.ts                # ioredis connection
│   ├── queue.ts                # BullMQ queue (producer)
│   ├── chroma.ts               # Chroma client + collection
│   ├── embeddings.ts           # cache-aware embed()
│   ├── chunking.ts             # text → chunks (overlap)
│   └── retrieval.ts            # Chroma similarity search
└── README.md
```

---

## Setup & Running

### docker-compose.yml (skeleton)

```yaml
services:
  app:
    build: .
    command: npm run start          # next start
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [postgres, chromadb, redis]

  worker:
    build: .
    command: npm run worker         # tsx worker/index.ts
    env_file: .env
    depends_on: [postgres, chromadb, redis]

  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: docchat
      POSTGRES_PASSWORD: docchat
      POSTGRES_DB: docchat
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]

  chromadb:
    image: chromadb/chroma:latest
    ports: ["8000:8000"]
    volumes: ["chromadata:/chroma/chroma"]

  redis:
    image: redis:7                  # or valkey/valkey:8 (open-source, same protocol)
    ports: ["6379:6379"]
    volumes: ["redisdata:/data"]

volumes:
  pgdata:
  chromadata:
  redisdata:
```

### Run (local dev)

```bash
docker-compose up -d postgres chromadb redis   # infra only
npm install
cp .env.example .env                           # fill in values
npx prisma migrate dev                         # create tables

# two processes — both must run:
npm run dev        # Next.js app
npm run worker     # ingestion worker
```

> **The mental shift:** `app` and `worker` are **two processes**. The app stays fast because the worker does the heavy lifting. In production both run as separate containers (`docker-compose up`).

---

## Environment Variables

| Variable | Example | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql://docchat:docchat@localhost:5432/docchat` | Postgres (Prisma) |
| `CHROMA_URL` | `http://localhost:8000` | ChromaDB server |
| `REDIS_URL` | `redis://localhost:6379` | Redis (queue + cache) |
| `OPENAI_API_KEY` | `sk-...` | Embeddings + LLM (or your provider) |

---

## Tech Choices Reference

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Next.js** (App Router) | UI + API routes in one app; first-class streaming |
| ORM / DB | **Prisma + Postgres** | Type-safe access; durable source of truth |
| Vector store | **ChromaDB** | Purpose-built similarity search + metadata filtering |
| Queue + cache | **Redis** (or Valkey) + **BullMQ** | Async ingestion, retries, embedding/answer cache |
| Streaming chat | **Vercel AI SDK** (`ai`) | Token streaming + `useChat` with minimal glue |
| PDF parsing | `pdf-parse` / `unpdf` | Lightweight text extraction |
| Packaging | **Docker + docker-compose** | All five services reproducible locally and in prod |
| CI | **GitHub Actions** | Lint + build on push |

**Quality levers (don't lose these in the infra):** ~800-char chunks · ~100 overlap · top-k=5 · **same embedding model for chunks and questions**. See [architecture.md §8.4](architecture.md#84-chunking--retrieval-are-the-quality-levers).

---

*Implements [architecture.md](architecture.md). Build along the data flow — infra → ingestion → retrieval → UI — verifying each phase before the next.*
