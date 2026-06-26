import { ChromaClient } from "chromadb";

// CHROMA_URL is a full URL (e.g. http://localhost:8000); split it into the
// host/port/ssl form the v3 client wants (the old `path` option is deprecated).
const url = new URL(process.env.CHROMA_URL ?? "http://localhost:8000");

export const chroma = new ChromaClient({
  host: url.hostname,
  port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
  ssl: url.protocol === "https:",
});

// embeddingFunction: null — we always pass our own vectors (from lib/embeddings),
// so Chroma must never try to embed text itself.
export const getCollection = () =>
  chroma.getOrCreateCollection({ name: "docchat_chunks", embeddingFunction: null });
