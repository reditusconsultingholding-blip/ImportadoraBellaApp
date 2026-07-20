import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

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
    return NextResponse.json({ error: "No podés eliminar tu propio usuario." }, { status: 400 });
  }
  if (target.role === "OWNER") {
    const otherOwners = await db.user.count({
      where: { organizationId: session.organizationId, role: "OWNER", id: { not: target.id } },
    });
    if (otherOwners === 0) {
      return NextResponse.json(
        { error: "No podés eliminar al único administrador de la organización." },
        { status: 400 }
      );
    }
  }

  await db.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
