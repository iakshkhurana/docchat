import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// List the current user's documents for the knowledge-base panel (newest first).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const documents = await prisma.document.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      filename: true,
      status: true,
      chunkCount: true,
      createdAt: true,
    },
  });
  return Response.json({ documents });
}
