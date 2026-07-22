import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { verifyShopifyConnection } from "@/lib/integrations/shopify";
import { syncShopifyStore } from "@/lib/integrations/shopify-sync";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { shopDomain, accessToken } = (await req.json()) as {
    shopDomain?: string;
    accessToken?: string;
  };
  if (!shopDomain?.trim() || !accessToken?.trim()) {
    return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
  }

  let shopName: string | undefined;
  try {
    const result = await verifyShopifyConnection(shopDomain.trim(), accessToken.trim());
    shopName = result.shopName;
  } catch (err) {
    return NextResponse.json(
      { error: "No se pudo verificar la tienda — revisá el dominio y el token." },
      { status: 400 }
    );
  }

  const store = await db.shopifyStore.upsert({
    where: {
      organizationId_shopDomain: {
        organizationId: session.organizationId,
        shopDomain: shopDomain.trim(),
      },
    },
    create: {
      organizationId: session.organizationId,
      shopDomain: shopDomain.trim(),
      accessToken: accessToken.trim(),
      connectedAt: new Date(),
    },
    update: {
      accessToken: accessToken.trim(),
      connectedAt: new Date(),
    },
  });

  try {
    const { ordersSynced } = await syncShopifyStore(store.id);
    return NextResponse.json({ ok: true, shopName, ordersSynced });
  } catch (err) {
    return NextResponse.json({
      ok: true,
      shopName,
      warning: "Se conectó, pero la primera sincronización falló.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
