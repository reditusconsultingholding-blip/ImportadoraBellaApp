import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageConexiones } from "@/lib/permissions";
import { syncShopifyStore } from "@/lib/integrations/shopify-sync";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManageConexiones(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const store = await db.shopifyStore.findFirst({
    where: { organizationId: session.organizationId, connectedAt: { not: null } },
  });
  if (!store) {
    return NextResponse.json({ error: "Todavía no hay una tienda conectada." }, { status: 409 });
  }

  try {
    // ?dias=90 rellena histórico a pedido; sin el parámetro, comportamiento normal.
    const dias = Number(req.nextUrl.searchParams.get("dias"));
    const { ordersSynced } = await syncShopifyStore(
      store.id,
      Number.isFinite(dias) && dias > 0 && dias <= 365 ? Math.round(dias) : undefined
    );
    return NextResponse.json({ ok: true, ordersSynced });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
