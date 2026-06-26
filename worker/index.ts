import "dotenv/config";
import { Worker } from "bullmq";
import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";
import { connection } from "../lib/redis";
import { prisma } from "../lib/db";
import { getCollection } from "../lib/chroma";
import { embed } from "../lib/embeddings";
import { chunk } from "../lib/chunking";
import type { IngestJob } from "../lib/queue";

const worker = new Worker<IngestJob>(
  "ingest",
  async (job) => {
    const { documentId, filePath } = job.data;

    try {
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "processing" },
      });

      // parse — one text string per page (mergePages: false)
      const buf = await readFile(filePath);
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await extractText(pdf, { mergePages: false });
      const pages = (text as string[]).map((t, i) => ({ text: t, page: i + 1 }));

      // chunk (~800 chars, ~100 overlap), tagged with page
      const chunks = chunk(pages);
      if (chunks.length === 0) throw new Error("no extractable text in document");

      // embed each chunk (Redis-cached), then upsert all vectors at once
      const embeddings: number[][] = [];
      for (const c of chunks) embeddings.push(await embed(c.text));

      const collection = await getCollection();
      await collection.upsert({
        ids: chunks.map((_, i) => `${documentId}:${i}`),
        embeddings,
        documents: chunks.map((c) => c.text),
        metadatas: chunks.map((c, i) => ({ documentId, chunkIndex: i, page: c.page })),
      });

      await prisma.document.update({
        where: { id: documentId },
        data: { status: "ready", chunkCount: chunks.length },
      });

      console.log(`✅ ${documentId}: indexed ${chunks.length} chunks`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "failed", error: message },
      });
      console.error(`❌ ${documentId}: ${message}`);
      throw err; // let BullMQ record the failure / retry
    }
  },
  { connection, concurrency: 2 },
);

worker.on("ready", () => console.log("ingest worker listening…"));
worker.on("failed", (job, err) => console.error(`job ${job?.id} failed:`, err.message));
