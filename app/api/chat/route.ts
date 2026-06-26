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

const ANSWER_TTL_SECONDS = 60 * 60; // 1h

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
  const body = await req.json();
  const documentId: string | undefined = body.documentId;

  // useChat sends `messages`; allow a plain `{ question }` for direct testing too.
  const messages: UIMessage[] =
    body.messages ??
    (body.question
      ? [{ id: "u1", role: "user", parts: [{ type: "text", text: body.question }] }]
      : []);

  if (!documentId) return Response.json({ error: "documentId required" }, { status: 400 });

  const question = questionFromMessages(messages);
  if (!question) return Response.json({ error: "empty question" }, { status: 400 });

  const cacheKey = `ans:${documentId}:${createHash("sha256").update(question).digest("hex")}`;

  // 1. answer cache — HIT streams the stored answer back (no LLM call)
  const cached = await connection.get(cacheKey);
  if (cached) {
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        const id = "cached";
        writer.write({ type: "text-start", id });
        writer.write({ type: "text-delta", id, delta: cached });
        writer.write({ type: "text-end", id });
      },
    });
    return createUIMessageStreamResponse({ stream });
  }

  // 2. retrieve top-5 chunks for this document
  const chunks = await retrieve(documentId, question);
  const context = chunks
    .map((c, i) => `[#${i + 1} | page ${c.page}]\n${c.text}`)
    .join("\n\n");

  const system = `You answer questions about a specific document.
Use ONLY the context below. If the answer isn't there, say you don't know.
Cite sources inline like [#2] when you use a chunk.

Context:
${context || "(no relevant context found)"}`;

  // 3. stream the answer; on completion cache it + persist both messages
  const modelMessages = await convertToModelMessages(messages);
  const result = streamText({
    model: openai("gpt-4o-mini"),
    system,
    messages: modelMessages,
    onFinish: async ({ text }) => {
      await connection.set(cacheKey, text, "EX", ANSWER_TTL_SECONDS);
      await prisma.message.createMany({
        data: [
          { documentId, role: "user", content: question },
          { documentId, role: "assistant", content: text },
        ],
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
