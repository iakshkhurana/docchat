# Phase 3 — Retrieval & Chat (how it was built)

Goal: ask a question over an indexed document and get a correct, **streamed** answer grounded in that document. A repeat question is served instantly from cache with no new API calls.

> This is the "read plane" — fast and synchronous, the opposite of the slow async ingestion in Phase 2.

---

## Files & logic

### `lib/retrieval.ts` — similarity search
`retrieve(documentId, question, k=5)` → the top-k most relevant chunks for one document.

- **Logic / flow:** embed the question with the **same** `embed()` (and same model) used for the chunks → `collection.query({ queryEmbeddings, nResults: 5, where: { documentId } })`. The `where` filter scopes the search to one document, so a single collection can hold every document's chunks.
- Returns `{ text, page, chunkIndex }[]` — `text` goes into the prompt, `page`/`chunkIndex` become citations.
- **Why same model matters:** question and chunk vectors must live in the same space, or "nearest" is meaningless.

### `app/api/chat/route.ts` — the chat endpoint (streaming)
`POST /api/chat` with `{ documentId, messages }` (useChat sends `messages`; a plain `{ question }` also works for testing). Flow:

1. **Build the cache key** — `ans:<documentId>:<sha256(question)>`.
2. **Cache lookup (HIT):** if the answer is cached, stream it straight back as a UI-message stream (`text-start → text-delta → text-end`) — **no LLM call, no retrieval**. This is the "instant repeat" path.
3. **MISS → retrieve** top-5 chunks → build a `system` prompt: "answer ONLY from this context, cite like [#2], say you don't know otherwise" + the chunks.
4. **Stream** the answer with `streamText` (Vercel AI SDK) → `toUIMessageStreamResponse()`, so tokens arrive in the browser live.
5. **`onFinish`** (after the stream completes): cache the answer (1h TTL) + persist both the user and assistant `Message` rows in Postgres.

- **Why cache first, before anything else:** a cache hit skips both the embedding call and the LLM call — the cheapest possible path.
- **Why `onFinish`, not before streaming:** we only cache/persist a *complete* answer, never a half-streamed one.
- **Grounding:** the system prompt forbids answering outside the retrieved context — that's what keeps answers faithful to the document instead of the model's general knowledge.

---

## Verify (Done-when proof)
- **Cache-HIT path** (no API key needed): seed `ans:<doc>:<hash>` in Redis → `POST /api/chat` streamed the stored answer back as a proper UI-message stream (`text-start/delta/end` + `[DONE]`) without calling OpenAI. ✅
- **Error paths:** missing `documentId` or empty question → `400`. ✅
- **MISS path** (retrieve → LLM stream → persist): code complete and type-checks; a live run needs a real `OPENAI_API_KEY` and a document that finished ingestion (`status: ready`).

```bash
npm run dev
# POST /api/chat { documentId, question }  → streamed answer
# ask the same question again              → instant, served from cache
```

## Notes / choices
| Topic | Choice | Why |
|---|---|---|
| Chat LLM | OpenAI `gpt-4o-mini` (Vercel AI SDK) | single provider — repo already uses OpenAI for embeddings + one key. Swapping to Claude is a one-line change: `@ai-sdk/anthropic` + `anthropic("claude-...")` (needs `ANTHROPIC_API_KEY`) |
| Response format | `toUIMessageStreamResponse()` | matches `useChat` in Phase 4 with zero glue |
| Cache TTL | 1 hour | answers can go stale if the doc changes; short TTL is safe |
| `convertToModelMessages` | `await`ed | it's async in AI SDK v7 (differs from older docs) |
| Citations | `[#n | page p]` in context | model cites `[#n]`; UI maps it to a page in Phase 5 |
