import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { relinkCampaignsToProducts } from "@/lib/integrations/windsor-sync";

// Los otros nombres de un producto en las campañas sin código (ver
// Product.aliasCampanas). Al guardar se reasignan las campañas en el momento,
// así el gasto aparece en el producto sin esperar la próxima sincronización.

/** Deja alias útiles: sin repetir, de 3 a 60 letras, como mucho 15. */
function limpiarAlias(entrada: unknown): string[] {
  if (!Array.isArray(entrada)) return [];
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const a of entrada) {
    if (typeof a !== "string") continue;
    const t = a.replace(/\s+/g, " ").trim().toUpperCase();
    if (t.length < 3 || t.length > 60 || vistos.has(t)) continue;
    vistos.add(t);
    salida.push(t);
  }
  return salida.slice(0, 15);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Los nombres de campaña los pone dirección." }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { productId?: string; alias?: unknown };
  if (!body.productId) return NextResponse.json({ error: "Falta el producto." }, { status: 400 });

  const aliasCampanas = limpiarAlias(body.alias);
  const r = await db.product.updateMany({
    where: { id: body.productId, organizationId: session.organizationId },
    data: { aliasCampanas },
  });
  if (r.count === 0) return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });

  const { linked } = await relinkCampaignsToProducts(session.organizationId);
  return NextResponse.json({ ok: true, alias: aliasCampanas, campanasReasignadas: linked });
}
