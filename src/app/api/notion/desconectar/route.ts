import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageConexiones } from "@/lib/permissions";

// El corte con Notion: se anula el token y la fecha de conexión. Las filas
// ya importadas (TareaDiaria / CampanaManual con origen "notion") se quedan
// — Notion deja de ser la fuente, la app pasa a serlo.

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManageConexiones(session.role)) {
    return NextResponse.json({ error: "Desconectar Notion es de dirección." }, { status: 403 });
  }

  await db.notionConnection.updateMany({
    where: { organizationId: session.organizationId },
    data: { token: null, connectedAt: null },
  });

  return NextResponse.json({ ok: true });
}
