import { embed as aiEmbed } from "ai";
import { openai } from "@ai-sdk/openai";
import { createHash } from "node:crypto";
import { connection } from "./redis";

const MODEL = openai.textEmbeddingModel("text-embedding-3-small");
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** Embed text, serving from the Redis cache (`emb:<hash>`) when possible. */
export async function embed(text: string): Promise<number[]> {
  const key = `emb:${createHash("sha256").update(text).digest("hex")}`;

  const cached = await connection.get(key);
  if (cached) return JSON.parse(cached) as number[];

  const { embedding } = await aiEmbed({ model: MODEL, value: text });
  await connection.set(key, JSON.stringify(embedding), "EX", TTL_SECONDS);
  return embedding;
}
