import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { totpConfigured, verifyTotpCode } from "@/lib/totp";

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

  // Segunda barrera además de "solo un administrador puede crear usuarios".
  //
  // Se aceptan dos formas, en este orden:
  //   1. El código rotativo de seis dígitos (cambia cada 30 segundos) que se
  //      ve en Mi perfil. Es el bueno: no se filtra leyendo el repositorio ni
  //      queda sirviendo para siempre si alguien lo llega a ver una vez.
  //   2. Un código fijo en USER_CREATION_CODE, para mientras no esté
  //      configurado el secreto rotativo.
  //
  // El 190300 histórico solo sigue valiendo si NO hay ninguna de las dos cosas
  // configuradas: así una instalación nueva no queda abierta, pero tampoco
  // depende para siempre de un número escrito en el código fuente.
  const typedCode = authCode?.trim() ?? "";
  const fixedCode = process.env.USER_CREATION_CODE?.trim();
  const rotatingOk = totpConfigured() && verifyTotpCode(typedCode);
  const fixedOk = fixedCode
    ? typedCode === fixedCode
    : !totpConfigured() && typedCode === "190300";

  if (!rotatingOk && !fixedOk) {
    return NextResponse.json({ error: "Código de autorización incorrecto." }, { status: 403 });
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
