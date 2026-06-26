import "dotenv/config";
import { prisma } from "../lib/db";
import { chroma } from "../lib/chroma";
import { connection } from "../lib/redis";
import { chunk } from "../lib/chunking";

// Uses a throwaway Chroma collection so it never locks the real "docchat_chunks"
// collection to a test dimension.
const TMP_COLLECTION = "verify_tmp";

async function main() {
  console.log("Phase 1 verify — Postgres, Chroma, Redis\n");

  // 1. Postgres (Prisma) — write + read back a User + Document
  const user = await prisma.user.create({
    data: { email: `verify-${Date.now()}@example.com`, passwordHash: "x" },
  });
  const doc = await prisma.document.create({
    data: { filename: "verify.pdf", status: "queued", userId: user.id },
  });
  const read = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
  console.log(`✅ Postgres: wrote Document ${read.id} (status=${read.status})`);

  // 2. Chroma — upsert a vector into a temp collection, then query it back
  const collection = await chroma.getOrCreateCollection({
    name: TMP_COLLECTION,
    embeddingFunction: null,
  });
  await collection.upsert({
    ids: [`verify-${doc.id}`],
    embeddings: [[0.1, 0.2, 0.3]],
    documents: ["hello world"],
    metadatas: [{ documentId: doc.id, page: 1 }],
  });
  const q = await collection.query({ queryEmbeddings: [[0.1, 0.2, 0.3]], nResults: 1 });
  console.log(`✅ Chroma: upserted + queried back → "${q.documents[0]?.[0]}"`);

  // 3. Redis — set + get a key
  await connection.set("verify:ping", "pong", "EX", 60);
  const pong = await connection.get("verify:ping");
  console.log(`✅ Redis: set/get → ${pong}`);

  // 4. Chunking (pure) — sanity check
  const chunks = chunk([{ text: "x".repeat(2000), page: 1 }]);
  console.log(`✅ Chunking: 2000 chars → ${chunks.length} chunks (page ${chunks[0].page})`);

  // cleanup
  await chroma.deleteCollection({ name: TMP_COLLECTION });
  await prisma.user.delete({ where: { id: user.id } }); // cascades the Document
  await connection.del("verify:ping");
  console.log("\n🧹 cleaned up. Phase 1 green.");
}

main()
  .catch((e) => {
    console.error("❌ verify failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    connection.disconnect();
  });
