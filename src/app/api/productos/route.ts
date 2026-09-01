import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { relinkCampaignsToProducts } from "@/lib/integrations/windsor-sync";

// Crear un producto a mano y anclarlo: al producto de Shopify (para que la
// economía real no dependa de que el nombre matchee solo), a una campaña de
// Meta o TikTok que ya esté corriendo, y a sus links de trackeo — si tiene
// más de uno, todos, porque el match automático por URL no funciona hoy (ver
// src/lib/product-code.ts) y estos quedan como referencia para el equipo.

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Crear productos es de dirección." }, { status: 403 });
  }

  const body = (await req.json()) as {
    code?: string;
    name?: string;
    shopifyProductId?: string;
    shopifyProductTitle?: string;
    campaignId?: string;
    links?: { url?: string; etiqueta?: string }[];
  };

  const name = body.name?.trim();
  const code = body.code?.trim().toUpperCase();
  if (!name || !code) {
    return NextResponse.json({ error: "El producto necesita nombre y código." }, { status: 400 });
  }

  const existing = await db.product.findFirst({
    where: { organizationId: session.organizationId, code },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: `Ya hay un producto con el código ${code}.` }, { status: 409 });
  }

  const verCifras = await veLasCifras(session.userId);

  const links = (body.links ?? [])
    .map((l) => ({ url: l.url?.trim() || "", etiqueta: l.etiqueta?.trim() || null }))
    .filter((l) => l.url.length > 0)
    .slice(0, 10);

  const product = await db.product.create({
    data: {
      organizationId: session.organizationId,
      code,
      name,
      shopifyProductId: body.shopifyProductId?.trim() || null,
      shopifyProductTitle: body.shopifyProductTitle?.trim() || null,
      // El CPA objetivo arranca en un valor evidentemente provisorio — no en
      // 0, que se leería como "ya calculado" y no como "falta cargarlo".
      cpaTarget: 10,
      links: links.length > 0 ? { create: links } : undefined,
    },
    select: { id: true, code: true },
  });

  if (body.campaignId) {
    const campana = await db.campaign.findFirst({
      where: { id: body.campaignId, adAccount: { organizationId: session.organizationId } },
      select: { id: true },
    });
    if (campana) {
      await db.campaign.update({
        where: { id: campana.id },
        data: { productId: product.id, productManual: true },
      });
    }
  }

  // Puede haber otras campañas cuyo nombre ya matchea este código/nombre
  // nuevo — se vinculan ya mismo en vez de esperar la próxima sincronización.
  await relinkCampaignsToProducts(session.organizationId);

  return NextResponse.json({ ok: true, product, verCifras });
}
