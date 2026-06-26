import { prisma } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password } = await req.json();

  if (typeof email !== "string" || typeof password !== "string") {
    return Response.json({ error: "Email and password are required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await createSession(user.id);
  return Response.json({ id: user.id, email: user.email, name: user.name });
}
