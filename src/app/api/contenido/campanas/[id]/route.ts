import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { relinkCampaignsToProducts } from "@/lib/integrations/windsor-sync";

// PATCH edita una Campaign sincronizada O una CampanaManual — el body trae
// `origen` para saber cuál. Asignar producto a mano marca productManual, que
// es lo que hace que el sync de 5 minutos deje de pisar la corrección (ver
// src/lib/integrations/windsor-sync.ts).

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Asignar campañas es de dirección." }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json()) as {
    origen?: "sync" | "manual";
    productId?: string | null;
    productManual?: boolean;
    activa?: boolean;
    archivar?: boolean;
    tipoCampana?: string | null;
  };

  if (body.origen === "manual") {
    const existing = await db.campanaManual.findFirst({
      where: { id, organizationId: session.organizationId },
    });
    if (!existing) return NextResponse.json({ error: "No encontrada." }, { status: 404 });

    const manual = await db.campanaManual.update({
      where: { id },
      data: {
        ...("productId" in body ? { productId: body.productId || null } : {}),
        ...("activa" in body ? { activa: Boolean(body.activa) } : {}),
      },
    });
    return NextResponse.json({ manual });
  }

  const existing = await db.campaign.findFirst({
    where: { id, adAccount: { organizationId: session.organizationId } },
  });
  if (!existing) return NextResponse.json({ error: "No encontrada." }, { status: 404 });

  const data: Record<string, unknown> = {};
  if ("productId" in body) {
    data.productId = body.productId || null;
    data.productManual = true;
  }
  if (body.productManual === false) {
    // "Reactivar auto-match": vuelve a dejar que el sync la matchee sola.
    data.productManual = false;
  }
  if ("archivar" in body) data.archivada = Boolean(body.archivar);
  if ("tipoCampana" in body) data.tipoCampana = body.tipoCampana || null;

  const campana = await db.campaign.update({ where: { id }, data });

  // Si se soltó la asignación manual, se re-matchea ya mismo — si no, el
  // producto quedaría vacío hasta la próxima sincronización.
  if (body.productManual === false) {
    await relinkCampaignsToProducts(session.organizationId);
  }

  return NextResponse.json({ campana });
}
