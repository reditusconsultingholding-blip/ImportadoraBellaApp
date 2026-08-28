import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSession, createSession } from "@/lib/auth";

// Cada persona entra con un correo genérico y lo cambia por el suyo desde
// "Mi cuenta". Se pide la contraseña actual: el correo es con lo que se
// inicia sesión, así que cambiarlo sin verificar sería un secuestro de cuenta
// si alguien deja la sesión abierta.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { email, currentPassword } = (await req.json()) as {
    email?: string;
    currentPassword?: string;
  };

  const nextEmail = email?.trim().toLowerCase();
  if (!nextEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nextEmail)) {
    return NextResponse.json({ error: "Escribe un correo válido." }, { status: 400 });
  }
  if (!currentPassword) {
    return NextResponse.json({ error: "Escribe tu contraseña actual." }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "La contraseña actual no es correcta." }, { status: 403 });
  }

  if (nextEmail === user.email) {
    return NextResponse.json({ error: "Ese ya es tu correo actual." }, { status: 400 });
  }

  const taken = await db.user.findUnique({ where: { email: nextEmail } });
  if (taken) {
    return NextResponse.json({ error: "Ya hay una cuenta con ese correo." }, { status: 409 });
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: { email: nextEmail },
  });

  // La sesión guarda el correo, así que hay que reemitirla.
  await createSession({
    userId: updated.id,
    organizationId: updated.organizationId,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    mustChangePassword: updated.mustChangePassword,
  });

  return NextResponse.json({ ok: true, email: updated.email });
}
