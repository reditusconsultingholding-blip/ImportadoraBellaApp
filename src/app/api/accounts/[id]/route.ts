import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageConexiones } from "@/lib/permissions";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  // Mismo permiso que crear la cuenta. Antes esta ruta solo miraba la
  // organización: cualquier editor podía reemplazar el token de producción
  // de una cuenta publicitaria, borrarla o quemar cuota sincronizando.
  if (!canManageConexiones(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const { id } = await params;
  const account = await db.adAccount.findUnique({ where: { id } });
  if (!account || account.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Cuenta no encontrada." }, { status: 404 });
  }
  if (account.connectedAt) {
    return NextResponse.json(
      { error: "Esta cuenta ya está conectada — desconectala antes de eliminarla." },
      { status: 400 }
    );
  }

  const campaignCount = await db.campaign.count({ where: { adAccountId: id } });
  if (campaignCount > 0) {
    return NextResponse.json(
      { error: "Esta cuenta ya tiene campañas registradas y no se puede eliminar." },
      { status: 400 }
    );
  }

  await db.adAccount.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
