<div align="center">

# 📄 DocChat

### Chat with your documents — answers grounded in *your* content, streamed in real time, with sources.

DocChat is a production-style **RAG (Retrieval-Augmented Generation)** application. Upload a PDF, and ask questions about it in natural language. Answers come back token-by-token, cite the exact page they came from, and never wander outside your document.

`Next.js` · `Prisma + Postgres` · `ChromaDB` · `Redis + BullMQ` · `Vercel AI SDK` · `Docker`

</div>

---

## ✨ Features

- **📥 Drop-in ingestion** — upload a PDF and it's parsed, chunked, embedded, and indexed automatically in the background.
- **⚡ Streaming answers** — responses stream token-by-token like a real chat, powered by the Vercel AI SDK.
- **🎯 Grounded & cited** — every answer is built *only* from your document's content, with inline `[#n]` citations back to the source page. No hallucinated facts.
- **🧠 Smart caching** — embeddings and answers are cached in Redis. Ask the same question twice and the second answer is instant and free.
- **🔀 Async by design** — slow work (parsing, embedding) runs in a dedicated worker, so the app stays fast and uploads return immediately.
- **🗑️ Consistent deletes** — removing a document fans out across Postgres, ChromaDB, and Redis so no stale data is ever served.
- **🐳 Fully containerized** — five services, one `docker-compose up`. Reproducible locally and in production.

---

## 🏗️ How It Works

DocChat is split into **two planes that never block each other**:

```
        ┌────────────────────── BROWSER ──────────────────────┐
        │          upload UI    ·    streaming chat UI         │
        └──────────────┬───────────────────────┬──────────────┘
            upload POST │                       │ chat POST (stream)
                        ▼                       ▼
        ┌─────────────────────────────────────────────────────┐
        │              NEXT.JS  (app + API routes)             │
        │   /api/upload ──enqueue──┐         /api/chat          │
        └──────────┬───────────────┼──────────────┬────────────┘
       write Document      push job to queue   1. answer cache?  → Redis
        (status=queued)          │             2. embed question → Redis
                   │             ▼             3. similarity search → Chroma
              ┌─────────┐   ┌──────────┐       4. LLM → stream tokens
              │POSTGRES │   │  REDIS   │       5. persist messages → Postgres
              │(Prisma) │   │queue+cache│
              └────▲────┘   └────┬─────┘
                   │             │ consume
            status │             ▼
            =ready  ┌──────────────────────────────────────┐
                   │           INGESTION WORKER             │
                   │  parse → chunk → embed → upsert vectors │
                   └───────────────────┬────────────────────┘
                                       ▼
                                 ┌──────────┐
                                 │ CHROMADB │  (vector store)
                                 └──────────┘
```

- **Write plane (ingestion)** — throughput-sensitive and slow, so it runs fully async through a queue and a worker.
- **Read plane (chat)** — latency-sensitive, so it's a fast synchronous request that streams straight back to the browser.

See [`docs/architecture.md`](docs/architecture.md) for the full design and [`docs/plan.md`](docs/plan.md) for the build plan.

---

## 🧰 Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | **Next.js** (App Router) | UI + API routes in one app; first-class streaming |
| Database / ORM | **Prisma + Postgres** | Type-safe access; durable source of truth |
| Vector store | **ChromaDB** | Purpose-built similarity search + metadata filtering |
| Queue & cache | **Redis + BullMQ** | Async ingestion with retries; embedding & answer caches |
| LLM streaming | **Vercel AI SDK** | Token streaming + `useChat` with minimal glue |
| Embeddings | **OpenAI** `text-embedding-3-small` | Same model for chunks and questions |
| PDF parsing | **unpdf** | Lightweight, per-page text extraction |
| Packaging | **Docker Compose** | All services reproducible in one command |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Docker Desktop
- An `OPENAI_API_KEY`

### 1. Clone & install
```bash
git clone <repo-url>
cd docchat
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```
Fill in `.env`:
```env
DATABASE_URL="postgresql://docchat:docchat@localhost:5432/docchat"
CHROMA_URL="http://localhost:8000"
REDIS_URL="redis://localhost:6379"
OPENAI_API_KEY="sk-..."
```

### 3. Start infrastructure
```bash
docker compose up -d postgres chromadb redis
```

### 4. Set up the database
```bash
npx prisma migrate dev
```

### 5. Run the app + worker (two processes)
```bash
npm run dev        # Next.js app  → http://localhost:3000
npm run worker     # ingestion worker (separate terminal)
```

Upload a PDF, wait for it to turn **ready**, and start chatting.

> **In production**, everything runs as containers: `docker compose up` brings up the app, worker, and all three stores together.

---

## 📁 Project Structure

```
docchat/
├── docker-compose.yml          # app, worker, postgres, chromadb, redis
├── prisma/
│   └── schema.prisma           # Document, Message
├── app/
│   ├── page.tsx                # document list + upload
│   ├── chat/[id]/page.tsx      # streaming chat per document
│   └── api/
│       ├── upload/route.ts     # thin: save + enqueue, return 202
│       ├── chat/route.ts       # cache → retrieve → LLM stream → persist
│       └── documents/[id]/route.ts  # DELETE → fan out to all 3 stores
├── worker/
│   └── index.ts                # BullMQ consumer: parse→chunk→embed→chroma
├── lib/
│   ├── db.ts                   # Prisma client (singleton)
│   ├── redis.ts                # ioredis connection
│   ├── queue.ts                # BullMQ queue (producer)
│   ├── chroma.ts               # Chroma client + collection
│   ├── embeddings.ts           # cache-aware embed()
│   ├── chunking.ts             # text → chunks (overlap)
│   └── retrieval.ts            # Chroma similarity search
└── docs/                       # architecture, build plan, per-phase notes
```

---

## ⚙️ Environment Variables

| Variable | Example | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql://docchat:docchat@localhost:5432/docchat` | Postgres (Prisma) |
| `CHROMA_URL` | `http://localhost:8000` | ChromaDB server |
| `REDIS_URL` | `redis://localhost:6379` | Redis (queue + cache) |
| `OPENAI_API_KEY` | `sk-...` | Embeddings + chat LLM |

---

## 🗺️ Roadmap

- [x] **Infrastructure** — Dockerized Postgres, ChromaDB, Redis
- [x] **Data layer** — Prisma schema + typed clients for every store
- [x] **Ingestion** — async upload → parse → chunk → embed → index
- [x] **Retrieval & chat** — grounded, streamed answers with answer caching
- [ ] **Frontend** — upload UI + live status + streaming chat view
- [ ] **Polish** — source-citation rendering, document delete, rate limiting
- [ ] **Ship** — CI (lint + build) and container deployment

---

## 📜 License

MIT
