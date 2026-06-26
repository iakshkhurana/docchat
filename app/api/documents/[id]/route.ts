import { prisma } from "@/lib/db";
import { getCollection } from "@/lib/chroma";
import { connection } from "@/lib/redis";
import { getCurrentUser } from "@/lib/auth";

// Delete a document and fan out to ALL THREE stores, or we serve ghosts:
//   1. ChromaDB — drop the document's vectors
//   2. Redis    — drop its cached answers
//   3. Postgres — delete the row (cascades Messages)
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  const doc = await prisma.document.findUnique({ where: { id }, select: { userId: true } });
  if (!doc || doc.userId !== user.id) {
    return Response.json({ error: "Document not found" }, { status: 404 });
  }

  // 1. Chroma vectors
  try {
    const collection = await getCollection();
    await collection.delete({ where: { documentId: id } });
  } catch {
    /* collection may not exist yet — nothing to drop */
  }

  // 2. Redis cached answers (ans:<id>:*)
  const keys = await connection.keys(`ans:${id}:*`);
  if (keys.length) await connection.del(...keys);

  // 3. Postgres (cascades Messages)
  await prisma.document.delete({ where: { id } });

  return Response.json({ ok: true });
}
