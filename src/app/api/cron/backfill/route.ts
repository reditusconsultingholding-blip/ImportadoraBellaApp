import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cronAuthorized } from "@/lib/cron-auth";
import { syncShopifyStore } from "@/lib/integrations/shopify-sync";
import { importarProductosDesdeCampanas } from "@/lib/product-import";
import { relinkCampaignsToProducts } from "@/lib/integrations/windsor-sync";

// Tareas de mantenimiento que no corren solas: rellenar histórico de Shopify y
// rearmar las fichas de producto a partir de las campañas.
//
// Va con el secreto del cron y no con sesión de usuario a propósito: son
// operaciones de máquina, y no hace falta entrar como el CEO para correrlas.

export const maxDuration = 800;

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const p = req.nextUrl.searchParams;
  const dias = Number(p.get("dias"));
  const salida: Record<string, unknown> = {};

  try {
    if (Number.isFinite(dias) && dias > 0 && dias <= 365) {
      const stores = await db.shopifyStore.findMany({ where: { connectedAt: { not: null } } });
      salida.shopify = await Promise.all(
        stores.map(async (s) => ({
          tienda: s.shopDomain,
          ...(await syncShopifyStore(s.id, Math.round(dias))),
        }))
      );
    }

    if (p.get("productos") === "1") {
      const orgs = await db.organization.findMany({ select: { id: true } });
      salida.productos = await Promise.all(
        orgs.map(async (o) => ({
          ...(await importarProductosDesdeCampanas(o.id)),
          ...(await relinkCampaignsToProducts(o.id)),
        }))
      );
    }

    return NextResponse.json({ ok: true, ...salida });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err), ...salida },
      { status: 502 }
    );
  }
}
