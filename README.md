<div align="center">

# 📄 DocChat

### Chat with your documents — answers grounded in *your* content, streamed in real time, with sources.

DocChat is a production-style **RAG (Retrieval-Augmented Generation)** application. Create an account, upload a PDF, and ask questions about it in natural language. Answers come back token-by-token, cite the exact page they came from, and never wander outside your document.

`Next.js` · `Prisma + Postgres` · `ChromaDB` · `Redis + BullMQ` · `Vercel AI SDK` · `Docker`

</div>

---

## ✨ Features

- **🔐 Accounts** — email/password auth with httpOnly JWT sessions; every document is scoped to its owner.
- **📥 Drop-in ingestion** — drag-and-drop a PDF and it's parsed, chunked, embedded, and indexed in the background.
- **⚡ Streaming answers** — responses stream token-by-token, powered by the Vercel AI SDK.
- **🎯 Grounded & cited** — answers are built *only* from your document, with inline `[#n]` citations and **source page chips** under each reply.
- **🧮 Rich rendering** — Markdown + LaTeX math rendered properly (headings, lists, code, equations).
- **🧠 Smart caching** — embeddings and answers cached in Redis; a repeat question is instant and free.
- **🔀 Async by design** — slow work (parsing, embedding) runs in a dedicated worker, so uploads return immediately.
- **🗑️ Consistent deletes** — removing a document fans out across Postgres, ChromaDB, and Redis.
- **🌗 Light / dark** — theme toggle on the dashboard, polished animated UI.
- **🛡️ Rate limited** — per-user request throttling on chat.
- **🐳 Containerized + CI** — `docker compose up` for all services; GitHub Actions runs lint + build on every push.

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
              ┌─────────┐   ┌──────────┐       4. LLM → stream tokens + sources
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

- **Write plane (ingestion)** — slow, so it runs fully async through a queue and a worker.
- **Read plane (chat)** — latency-sensitive, so it's a fast request that streams straight back.

See [`docs/architecture.md`](docs/architecture.md) for the full design and [`docs/plan.md`](docs/plan.md) for the build plan (per-phase notes in `docs/phase-*.md`).

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
| Auth | **jose** (JWT) + **bcryptjs** | httpOnly session cookies, hashed passwords |
| Rendering | **react-markdown** + **KaTeX** | Markdown + math in answers |
| PDF parsing | **unpdf** | Lightweight, per-page text extraction |
| Packaging | **Docker Compose** + GitHub Actions | Reproducible services; CI on push |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Docker Desktop
- An `OPENAI_API_KEY`

### 1. Install
```bash
cd docchat
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```
```env
DATABASE_URL="postgresql://docchat:docchat@localhost:5432/docchat"
CHROMA_URL="http://localhost:8000"
REDIS_URL="redis://localhost:6379"
OPENAI_API_KEY="sk-..."
AUTH_SECRET="a-long-random-string"   # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Start infrastructure
```bash
docker compose up -d postgres chromadb redis
```

### 4. Set up the database
```bash
npx prisma migrate dev
```

### 5. Run the app + worker
```bash
npm run dev        # starts BOTH the Next.js app and the ingestion worker
```
> `npm run dev` runs the app **and** the worker together (via `concurrently`). Use `npm run dev:app` for the app only, or `npm run worker` to run the worker separately.

Open **http://localhost:3000**, create an account, upload a PDF, watch it turn **Indexed**, and start chatting.

> **Production:** `docker compose up` brings up the app, worker, and all three stores as containers.

---

## 📁 Project Structure

```
docchat/
├── docker-compose.yml          # app, worker, postgres, chromadb, redis
├── Dockerfile                  # one image; app & worker differ by entrypoint
├── prisma/schema.prisma        # User, Document, Message
├── prisma.config.ts            # Prisma 7 datasource config
├── app/
│   ├── page.tsx                # landing page
│   ├── login/ · signup/        # auth pages
│   ├── app/                    # dashboard (auth-guarded)
│   │   ├── page.tsx            #   server guard → Dashboard
│   │   ├── dashboard.tsx       #   upload + document list + status
│   │   └── chat-panel.tsx      #   streaming chat + citations
│   └── api/
│       ├── auth/{signup,login,logout}/route.ts
│       ├── upload/route.ts     # thin: save + enqueue, 202
│       ├── chat/route.ts       # cache → retrieve → LLM stream + sources → persist
│       └── documents/route.ts · documents/[id]/route.ts   # list · DELETE (3-store fan-out)
├── worker/index.ts             # BullMQ consumer: parse→chunk→embed→chroma
├── lib/                        # db, redis, queue, chroma, embeddings, chunking, retrieval, auth
├── components/                 # logo, icons, auth-form, theme-toggle, confirm-dialog, markdown
├── .github/workflows/ci.yml    # lint + build on push
└── docs/                       # architecture, plan, per-phase notes
```

---

## ⚙️ Environment Variables

| Variable | Example | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql://docchat:docchat@localhost:5432/docchat` | Postgres (Prisma) |
| `CHROMA_URL` | `http://localhost:8000` | ChromaDB server |
| `REDIS_URL` | `redis://localhost:6379` | Redis (queue + cache) |
| `OPENAI_API_KEY` | `sk-...` | Embeddings + chat LLM |
| `AUTH_SECRET` | `<32-byte hex>` | Session (JWT) signing secret |

---

## 🗺️ Roadmap

- [x] **Infrastructure** — Dockerized Postgres, ChromaDB, Redis
- [x] **Data layer** — Prisma schema + typed clients for every store
- [x] **Ingestion** — async upload → parse → chunk → embed → index
- [x] **Retrieval & chat** — grounded, streamed answers with answer caching
- [x] **Frontend** — landing, auth, dashboard with live status + streaming chat
- [x] **Polish** — source citations, document delete, rate limiting, light/dark, error handling
- [x] **Ship** — CI (lint + build) + containerized deploy
- [ ] Hosted deployment + README screenshots

---

## 📜 License

MIT
