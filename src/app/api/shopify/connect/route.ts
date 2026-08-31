import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageConexiones } from "@/lib/permissions";
import { verifyShopifyConnection, hasShopifyAppCredentials } from "@/lib/integrations/shopify";
import { syncShopifyStore } from "@/lib/integrations/shopify-sync";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManageConexiones(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const { shopDomain, accessToken } = (await req.json()) as {
    shopDomain?: string;
    accessToken?: string;
  };
  if (!shopDomain?.trim()) {
    return NextResponse.json({ error: "Falta el dominio de la tienda." }, { status: 400 });
  }

  // El token puede venir vacío: si la app "Jarvin Panal" está configurada por
  // variables de entorno (SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET), el token
  // lo pide y lo renueva solo el cliente de Shopify.
  const token = accessToken?.trim() || null;
  if (!token && !hasShopifyAppCredentials()) {
    return NextResponse.json(
      {
        error:
          "Pegá el Admin API access token, o configurá SHOPIFY_CLIENT_ID y SHOPIFY_CLIENT_SECRET para que el token se renueve solo.",
      },
      { status: 400 }
    );
  }

  let shopName: string | undefined;
  try {
    const result = await verifyShopifyConnection(shopDomain.trim(), token);
    shopName = result.shopName;
  } catch (err) {
    return NextResponse.json(
      {
        error: "No se pudo verificar la tienda — revisa el dominio y las credenciales.",
        detail: err instanceof Error ? err.message : String(err),
      },
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
      accessToken: token,
      connectedAt: new Date(),
    },
    update: {
      accessToken: token,
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
