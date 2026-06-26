import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { connection } from "@/lib/redis";
import { retrieve } from "@/lib/retrieval";
import { getCurrentUser } from "@/lib/auth";

const ANSWER_TTL_SECONDS = 60 * 60; // 1h
const RATE_LIMIT = 20; // messages per minute per user

interface Source {
  n: number;
  page: number;
}

function questionFromMessages(messages: UIMessage[]): string {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return "";
  return last.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join(" ")
    .trim();
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // rate limit: INCR ratelimit:<userId>, expire after 60s
  const rlKey = `ratelimit:${user.id}`;
  const hits = await connection.incr(rlKey);
  if (hits === 1) await connection.expire(rlKey, 60);
  if (hits > RATE_LIMIT) {
    return Response.json({ error: "Too many requests — slow down a moment." }, { status: 429 });
  }

  const body = await req.json();
  const documentId: string | undefined = body.documentId;

  // useChat sends `messages`; allow a plain `{ question }` for direct testing too.
  const messages: UIMessage[] =
    body.messages ??
    (body.question
      ? [{ id: "u1", role: "user", parts: [{ type: "text", text: body.question }] }]
      : []);

  if (!documentId) return Response.json({ error: "documentId required" }, { status: 400 });

  // ensure the document belongs to the current user
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { userId: true },
  });
  if (!doc || doc.userId !== user.id) {
    return Response.json({ error: "Document not found" }, { status: 404 });
  }

  const question = questionFromMessages(messages);
  if (!question) return Response.json({ error: "empty question" }, { status: 400 });

  const cacheKey = `ans:${documentId}:${createHash("sha256").update(question).digest("hex")}`;

  // 1. answer cache — HIT streams the stored answer + its sources (no LLM call)
  const cached = await connection.get(cacheKey);
  if (cached) {
    let text = cached;
    let sources: Source[] = [];
    try {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed.text === "string") {
        text = parsed.text;
        sources = parsed.sources ?? [];
      }
    } catch {
      /* legacy cache entry stored as a plain string */
    }
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        if (sources.length) writer.write({ type: "data-sources", data: sources });
        const id = "cached";
        writer.write({ type: "text-start", id });
        writer.write({ type: "text-delta", id, delta: text });
        writer.write({ type: "text-end", id });
      },
    });
    return createUIMessageStreamResponse({ stream });
  }

  // 2. retrieve top-5 chunks for this document
  const chunks = await retrieve(documentId, question);
  const sources: Source[] = chunks.map((c, i) => ({ n: i + 1, page: c.page }));
  const context = chunks
    .map((c, i) => `[#${i + 1} | page ${c.page}]\n${c.text}`)
    .join("\n\n");

  const system = `You answer questions about a specific document.
Use ONLY the context below. If the answer isn't there, say you don't know.
Cite sources inline like [#2] when you use a chunk.
Format answers in Markdown. For math, use $...$ for inline and $$...$$ for display equations.

Context:
${context || "(no relevant context found)"}`;

  // 3. stream sources first, then the answer; on completion cache + persist
  const modelMessages = await convertToModelMessages(messages);
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      if (sources.length) writer.write({ type: "data-sources", data: sources });
      const result = streamText({
        model: openai("gpt-4o-mini"),
        system,
        messages: modelMessages,
        onFinish: async ({ text }) => {
          await connection.set(
            cacheKey,
            JSON.stringify({ text, sources }),
            "EX",
            ANSWER_TTL_SECONDS,
          );
          await prisma.message.createMany({
            data: [
              { documentId, role: "user", content: question },
              { documentId, role: "assistant", content: text },
            ],
          });
        },
      });
      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
