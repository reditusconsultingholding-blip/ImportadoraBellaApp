import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const users = await db.user.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (session.role !== "OWNER") {
    return NextResponse.json({ error: "Solo un administrador puede crear usuarios." }, { status: 403 });
  }

  const { email, name, password, role, authCode } = (await req.json()) as {
    email?: string;
    name?: string;
    password?: string;
    role?: string;
    authCode?: string;
  };

  // Segunda barrera además de "solo un administrador puede crear usuarios":
  // sin el código de autorización no se crea la cuenta (ver docs/DECISIONES.md).
  const expectedCode = process.env.USER_CREATION_CODE?.trim() || "190300";
  if (authCode?.trim() !== expectedCode) {
    return NextResponse.json(
      { error: "Código de autorización incorrecto." },
      { status: 403 }
    );
  }

  if (!email?.trim() || !name?.trim() || !password || password.length < 6) {
    return NextResponse.json(
      { error: "Completá nombre, correo y una contraseña de al menos 6 caracteres." },
      { status: 400 }
    );
  }
  const validRoles = ["OWNER", "DIRECTOR", "EDITOR", "PENDING"] as const;
  type RoleValue = (typeof validRoles)[number];
  const finalRole: RoleValue = validRoles.includes(role as RoleValue)
    ? (role as RoleValue)
    : "PENDING";

  const existing = await db.user.findUnique({ where: { email: email.trim() } });
  if (existing) {
    return NextResponse.json({ error: "Ya existe un usuario con ese correo." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.user.create({
    data: {
      email: email.trim(),
      name: name.trim(),
      passwordHash,
      role: finalRole,
      organizationId: session.organizationId,
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  return NextResponse.json({ user });
}
