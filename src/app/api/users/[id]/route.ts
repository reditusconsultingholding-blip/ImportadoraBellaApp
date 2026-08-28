import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

const ROLES = ["OWNER", "DIRECTOR", "EDITOR", "PENDING"] as const;
type RoleValue = (typeof ROLES)[number];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (session.role !== "OWNER") {
    return NextResponse.json({ error: "Solo un administrador puede editar usuarios." }, { status: 403 });
  }

  const { id } = await params;
  const target = await db.user.findUnique({ where: { id } });
  if (!target || target.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  const body = (await req.json()) as {
    name?: string;
    email?: string;
    role?: string;
    canViewPayroll?: boolean;
    newPassword?: string;
  };

  const data: {
    name?: string;
    email?: string;
    role?: RoleValue;
    canViewPayroll?: boolean;
    passwordHash?: string;
    mustChangePassword?: boolean;
  } = {};

  if (body.name?.trim()) data.name = body.name.trim();

  if (body.email?.trim()) {
    const email = body.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "Ese correo no es válido." }, { status: 400 });
    }
    if (email !== target.email) {
      const taken = await db.user.findUnique({ where: { email } });
      if (taken) {
        return NextResponse.json({ error: "Ya hay una cuenta con ese correo." }, { status: 409 });
      }
      data.email = email;
    }
  }

  if (body.role && ROLES.includes(body.role as RoleValue)) {
    const nextRole = body.role as RoleValue;
    // No dejar la organización sin ningún administrador: si este es el último
    // OWNER, no se le puede bajar el rol (ni siquiera a sí mismo).
    if (target.role === "OWNER" && nextRole !== "OWNER") {
      const otherOwners = await db.user.count({
        where: { organizationId: session.organizationId, role: "OWNER", id: { not: target.id } },
      });
      if (otherOwners === 0) {
        return NextResponse.json(
          { error: "No puedes quitarle el rol al único administrador." },
          { status: 400 }
        );
      }
    }
    data.role = nextRole;
  }

  if (typeof body.canViewPayroll === "boolean") {
    // El permiso de nómina solo lo puede repartir alguien que ya lo tenga.
    // Si no, cualquier administrador se lo autoasignaría y el pago dejaría de
    // ser información restringida.
    const me = await db.user.findUnique({
      where: { id: session.userId },
      select: { canViewPayroll: true },
    });
    if (!me?.canViewPayroll) {
      return NextResponse.json(
        { error: "Solo alguien con acceso a la nómina puede dar o quitar ese permiso." },
        { status: 403 }
      );
    }
    data.canViewPayroll = body.canViewPayroll;
  }

  if (body.newPassword) {
    if (body.newPassword.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres." },
        { status: 400 }
      );
    }
    data.passwordHash = await bcrypt.hash(body.newPassword, 10);
    // Se la asignó otra persona: la próxima vez que entre, la cambia.
    data.mustChangePassword = true;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No hay nada que cambiar." }, { status: 400 });
  }

  const updated = await db.user.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      canViewPayroll: true,
      createdAt: true,
    },
  });

  // El nombre y el cargo de la ficha de nómina siguen al usuario.
  if (data.name) {
    await db.employee.updateMany({ where: { userId: id }, data: { fullName: data.name } });
  }

  return NextResponse.json({ ok: true, user: { ...updated, createdAt: updated.createdAt.toISOString() } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (session.role !== "OWNER") {
    return NextResponse.json({ error: "Solo un administrador puede eliminar usuarios." }, { status: 403 });
  }

  const { id } = await params;

  const target = await db.user.findUnique({ where: { id } });
  if (!target || target.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }
  if (target.id === session.userId) {
    return NextResponse.json({ error: "No puedes eliminar tu propio usuario." }, { status: 400 });
  }
  if (target.role === "OWNER") {
    const otherOwners = await db.user.count({
      where: { organizationId: session.organizationId, role: "OWNER", id: { not: target.id } },
    });
    if (otherOwners === 0) {
      return NextResponse.json(
        { error: "No puedes eliminar al único administrador de la organización." },
        { status: 400 }
      );
    }
  }

  await db.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
