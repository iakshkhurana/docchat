# DocChat — System Architecture

A RAG (Retrieval-Augmented Generation) system. Upload a document, ask questions, get answers grounded in *your* document's content — streamed, with source citations.

Designed from the start as a multi-service system: clean separation of concerns, async ingestion, and a dedicated vector store.

> **Status:** Architecture blueprint
> **Stack:** Next.js · Prisma/Postgres · ChromaDB · Redis · Docker

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Design Principles](#2-design-principles)
3. [Component Responsibilities](#3-component-responsibilities)
4. [Data Stores — Who Owns What](#4-data-stores--who-owns-what)
5. [Core Flows](#5-core-flows)
6. [Data Model](#6-data-model)
7. [Service Topology (Docker)](#7-service-topology-docker)
8. [Key Design Decisions](#8-key-design-decisions)
9. [Failure Modes & Consistency](#9-failure-modes--consistency)
10. [Scaling Path](#10-scaling-path)

---

## 1. System Overview

DocChat is split into **two planes** that never block each other:

- **Read plane** — the chat: question → retrieve → LLM → stream answer. Latency-sensitive.
- **Write plane** — ingestion: parse → chunk → embed → index. Throughput-sensitive, slow, runs async.

```
                          ┌─────────────────────────────────────────┐
                          │                BROWSER                   │
                          │   upload UI   ·   streaming chat UI      │
                          └───────────────┬───────────────┬─────────┘
                                          │               │
                              upload (POST)│               │chat (POST, SSE stream)
                                          ▼               ▼
        ┌─────────────────────────────────────────────────────────────────────┐
        │                        NEXT.JS  (app + API routes)                   │
        │                                                                       │
        │   /api/upload ──enqueue──┐              /api/chat                      │
        │        │                 │                  │                          │
        └────────┼─────────────────┼──────────────────┼──────────────────────── ┘
                 │                 │                  │
        write Document row    push job           1. answer cache?  ──► Redis
        (status=queued)         │                2. embed question ──► Redis (cache)
                 │              ▼                3. similarity search ─► ChromaDB
                 ▼        ┌──────────┐           4. LLM stream
            ┌─────────┐   │  REDIS   │           5. persist messages ─► Postgres
            │ POSTGRES│   │ queue +  │
            │ (Prisma)│   │  cache   │
            └─────────┘   └────┬─────┘
                 ▲             │ consume job
                 │             ▼
                 │     ┌─────────────────────────────────────────┐
                 │     │            INGESTION WORKER              │
                 │     │  parse → chunk → embed → upsert vectors  │
                 │     └──────┬───────────────────────┬──────────┘
                 │            │                        │
                 └─ status ───┘                        ▼
                   ready                          ┌──────────┐
                                                  │ CHROMADB │
                                                  │ (vectors)│
                                                  └──────────┘
```

Five services, each containerized: **Next.js app**, **ingestion worker**, **Postgres**, **ChromaDB**, **Redis**.

---

## 2. Design Principles

1. **Separate the two planes.** Slow ingestion never blocks fast chat. They communicate only through a queue and the data stores.
2. **One job per store.** Postgres = durable facts. ChromaDB = vector search. Redis = ephemeral speed (cache + queue). No store does another's job.
3. **Async by default.** Anything slow (parsing, embedding) goes through the queue and a worker, never inside a request.
4. **Source of truth is singular.** Postgres is authoritative. Chroma and Redis are derived/disposable — rebuildable from Postgres + the original file.
5. **Stateless app tier.** The Next.js app and the worker hold no local state, so both scale horizontally.

---

## 3. Component Responsibilities

| Component | Owns | Does NOT do |
|-----------|------|-------------|
| **Next.js app** | HTTP, auth, upload intake, chat orchestration, SSE streaming | Heavy parsing/embedding (delegates to worker) |
| **Ingestion worker** | Parse → chunk → embed → index; status updates | Serve user requests |
| **Postgres (Prisma)** | Documents, messages, status — the source of truth | Vector similarity search |
| **ChromaDB** | Chunk embeddings + text + metadata; top-k search | Relational queries, history |
| **Redis** | Job queue (BullMQ), embedding cache, answer cache, progress | Durable storage |

---

## 4. Data Stores — Who Owns What

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   POSTGRES   │   │   CHROMADB   │   │    REDIS     │
│  (durable)   │   │  (vectors)   │   │ (ephemeral)  │
├──────────────┤   ├──────────────┤   ├──────────────┤
│ Document     │   │ chunk id     │   │ ingest queue │
│ Message      │   │ embedding    │   │ emb: cache   │
│ status       │   │ chunk text   │   │ ans: cache   │
│ chunkCount   │   │ metadata:    │   │ progress:    │
│              │   │  documentId  │   │ ratelimit:   │
│              │   │  chunkIndex  │   │              │
│              │   │  page        │   │              │
└──────────────┘   └──────────────┘   └──────────────┘
   source of          derived            disposable
    truth          (rebuildable)      (rebuildable)
```

**Rule:** if Redis or Chroma is wiped, the system is rebuildable from Postgres + original files by re-running ingestion. If Postgres is wiped, data is gone. Back up accordingly.

---

## 5. Core Flows

### 5.1 Ingestion (write plane — async)

```
1. Browser → POST /api/upload (multipart file)
2. App: store file, INSERT Document (status="queued"), enqueue { documentId, filePath }
3. App → 202 Accepted (returns instantly — user is NOT blocked)
4. Worker: pull job from Redis queue
   a. status → "processing"
   b. parse text          (pdf-parse / unpdf)
   c. chunk               (~800 chars, ~100 overlap)
   d. embed each chunk    (check Redis emb-cache first)
   e. upsert vectors → ChromaDB  (ids, embeddings, documents, metadata)
   f. UPDATE Document status → "ready", chunkCount = n
   g. publish progress → Redis pub-sub (optional, for live UI)
5. Browser sees status flip to "ready"
```

### 5.2 Query (read plane — streamed)

```
1. Browser → POST /api/chat { documentId, question }
2. App: answer-cache lookup  → Redis  ans:<docId>:<hash(q)>
        └─ HIT → stream cached answer, done
3. Embed question            → Redis  emb:<hash(q)>  (cache)
4. Similarity search         → ChromaDB.query(emb, k=5, where={documentId})
5. Build prompt: top-5 chunks + question + system instructions
6. LLM → stream tokens to browser (SSE / Vercel AI SDK)
7. On completion: cache answer (Redis, short TTL) + INSERT user & assistant Messages (Postgres)
```

### 5.3 Delete (consistency-critical)

```
DELETE /api/documents/:id  must fan out to ALL THREE stores:
   1. Postgres:  delete Document (cascades Messages)
   2. ChromaDB:  collection.delete({ where: { documentId } })
   3. Redis:     drop ans:<id>:*  cache entries
Do all three, or you serve ghosts.
```

---

## 6. Data Model

### Postgres (Prisma) — source of truth

```prisma
model Document {
  id         String    @id @default(cuid())
  filename   String
  status     String    @default("queued") // queued | processing | ready | failed
  chunkCount Int       @default(0)
  error      String?                       // failure reason when status="failed"
  createdAt  DateTime  @default(now())
  messages   Message[]
}

model Message {
  id         String   @id @default(cuid())
  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  role       String   // user | assistant
  content    String   @db.Text
  createdAt  DateTime @default(now())
}
```

> No `embedding` column and no `Chunk` table in Postgres — vectors and chunk text live in ChromaDB. Citations come from Chroma's returned metadata.

### ChromaDB — one collection, many documents

```
collection: "docchat_chunks"
  id:        "<documentId>:<chunkIndex>"
  embedding: float[1536]            // dimension matches the embedding model
  document:  "<the chunk text>"     // returned for the LLM prompt + citations
  metadata:  { documentId, chunkIndex, page }
```

`documentId` in metadata is the filter key — one collection holds every document, queries scope with `where: { documentId }`.

### Redis — key conventions

```
ingest queue          BullMQ-managed keys (queue name: "ingest")
emb:<sha256(text)>    cached embedding (JSON float array)   TTL ~30d
ans:<docId>:<hash(q)> cached answer (string)                TTL ~1h
progress:<docId>      pub-sub channel for live ingestion %
ratelimit:<userId>    counter, EXPIRE 60                     (optional)
```

Always **hash** text/questions before using them as keys.

---

## 7. Service Topology (Docker)

Everything runs as containers via `docker-compose`. Five services:

| Service | Image | Port | Volume | Role |
|---------|-------|------|--------|------|
| `app` | built from repo (Next.js) | 3000 | — | HTTP + chat orchestration |
| `worker` | built from repo (same image, different entry) | — | — | Ingestion consumer |
| `postgres` | `postgres:16` | 5432 | `pgdata` | Source of truth |
| `chromadb` | `chromadb/chroma:latest` | 8000 | `chromadata` | Vector store |
| `redis` | `redis:7` (or `valkey/valkey:8`) | 6379 | `redisdata` | Queue + cache |

`app` and `worker` share one codebase/image — they differ only by entrypoint (`next start` vs `node worker`). Both are stateless; scale by running more replicas.

```
docker-compose
├── app       (depends_on: postgres, chromadb, redis)
├── worker    (depends_on: postgres, chromadb, redis)
├── postgres  → pgdata
├── chromadb  → chromadata
└── redis     → redisdata
```

---

## 8. Key Design Decisions

### 8.1 Dedicated vector DB (ChromaDB), not pgvector
Vectors get a purpose-built store with first-class indexing and metadata filtering in one call. Keeps Postgres focused on relational facts. Trade-off: one more service + a delete that must hit two stores. Accepted for clean separation and the production-shaped design.

### 8.2 Async ingestion via a queue (Redis + BullMQ)
Parsing/embedding a large doc takes seconds-to-minutes. Doing it inline would freeze the upload and tie up an app worker. The queue makes uploads return instantly, gives retries/concurrency control for free, and lets ingestion scale independently of chat.

### 8.3 Two-layer cache (Redis)
Embeddings are deterministic per text → cache them (long TTL). Repeat questions on the same doc → cache the whole answer (short TTL). Cuts cost and latency on the hot path.

### 8.4 Chunking + retrieval are the quality levers
~800-char chunks, ~100 overlap, top-k=5, **same embedding model for chunks and questions.** These decide answer quality; the infra around them decides speed and scale. Don't confuse the two.

### 8.5 Stateless tiers
No local state in `app` or `worker` → horizontal scaling is just "run more". All shared state lives in Postgres / Chroma / Redis.

---

## 9. Failure Modes & Consistency

| Failure | Behaviour | Mitigation |
|---------|-----------|------------|
| Worker crashes mid-ingest | Job stays on queue | BullMQ retries on restart; status stuck `processing` until then |
| Parse fails (corrupt PDF) | — | Catch → status `failed` + `error` message; surface in UI |
| Three stores disagree | Ghost vectors / stale answers | Every delete fans out to all three (§5.3) |
| Redis down | No queue, no cache | App degrades: ingestion pauses, chat falls back to uncached path |
| ChromaDB down | No retrieval | Chat returns a clear error; ingestion jobs retry |
| Duplicate upload | Re-embeds same content | Optional: dedupe by file hash before enqueue |

**Consistency model:** Postgres is strongly consistent and authoritative. Chroma/Redis are eventually consistent with it — acceptable because they're rebuildable. The one invariant that must hold: **deletes propagate everywhere.**

---

## 10. Scaling Path

The architecture already scales horizontally; these are the levers when load grows:

- **More chat throughput** → more `app` replicas behind a load balancer (stateless).
- **Faster ingestion** → more `worker` replicas + higher BullMQ concurrency.
- **Bigger corpus** → tune ChromaDB HNSW params; shard collections if needed.
- **Multi-tenant** → add `userId` to metadata + Redis keys; filter every query by it.
- **Cross-document chat** → drop the single-`documentId` filter, retrieve across a user's whole library.
- **Managed infra** → swap containers for hosted Postgres (Neon/Supabase), hosted Redis, hosted/self-hosted Chroma; the app code doesn't change.

---

*See [plan.md](plan.md) for the phased build plan, project structure, and setup.*
