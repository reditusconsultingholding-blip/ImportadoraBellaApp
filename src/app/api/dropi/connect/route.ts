import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";

// Guarda la integration key de Dropi. A diferencia de Meta/TikTok/Shopify,
// todavía no hay un sync real contra la API de Dropi aquí — sus endpoints
// son privados y hace falta que su equipo de IT habilite el acceso (ver
// nota en la UI). Por ahora esto solo deja la key guardada y lista para
// cuando se conecte el sync de verdad.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Solo un Director u Administrador puede conectar Dropi." }, { status: 403 });
  }

  const { integrationKey } = (await req.json()) as { integrationKey?: string };
  if (!integrationKey?.trim()) {
    return NextResponse.json({ error: "Falta la integration key." }, { status: 400 });
  }

  const existing = await db.dropiConnection.findFirst({ where: { organizationId: session.organizationId } });
  if (existing) {
    await db.dropiConnection.update({
      where: { id: existing.id },
      data: { integrationKey: integrationKey.trim(), connectedAt: new Date() },
    });
  } else {
    await db.dropiConnection.create({
      data: { organizationId: session.organizationId, integrationKey: integrationKey.trim(), connectedAt: new Date() },
    });
  }

  return NextResponse.json({
    ok: true,
    warning:
      "Key guardada. La sincronización real todavía no está conectada — los endpoints de Dropi son privados y hace falta confirmar el formato exacto con su equipo. Mientras tanto, la torre logística sigue con datos de ejemplo.",
  });
}
