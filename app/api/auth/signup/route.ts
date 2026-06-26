import { prisma } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password, name } = await req.json();

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return Response.json({ error: "Email and password are required" }, { status: 400 });
  }
  if (password.length < 6) {
    return Response.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    return Response.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      name: typeof name === "string" && name.trim() ? name.trim() : null,
      passwordHash: await hashPassword(password),
    },
  });

  await createSession(user.id);
  return Response.json({ id: user.id, email: user.email, name: user.name }, { status: 201 });
}
