import { writeFile, mkdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { ingestQueue } from "@/lib/queue";
import { getCurrentUser } from "@/lib/auth";

// Thin intake: persist the file, create a queued Document, enqueue the job,
// return 202 immediately. All parsing/embedding happens in the worker.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "no file provided" }, { status: 400 });
  }

  const uploadDir = join(process.cwd(), "uploads");
  await mkdir(uploadDir, { recursive: true });
  const filePath = join(uploadDir, `${randomUUID()}${extname(file.name)}`);
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

  const doc = await prisma.document.create({
    data: { filename: file.name, status: "queued", userId: user.id },
  });

  await ingestQueue.add("ingest", { documentId: doc.id, filePath });

  return Response.json({ id: doc.id, status: doc.status }, { status: 202 });
}
