import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { syncShopifyStore } from "@/lib/integrations/shopify-sync";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const store = await db.shopifyStore.findFirst({
    where: { organizationId: session.organizationId, connectedAt: { not: null } },
  });
  if (!store) {
    return NextResponse.json({ error: "Todavía no hay una tienda conectada." }, { status: 409 });
  }

  try {
    const { ordersSynced } = await syncShopifyStore(store.id);
    return NextResponse.json({ ok: true, ordersSynced });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
