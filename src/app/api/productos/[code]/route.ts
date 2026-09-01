import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";

async function productoDeLaOrg(code: string, organizationId: string) {
  return db.product.findFirst({ where: { organizationId, code }, select: { id: true, code: true } });
}

/** Anclar (o soltar) el producto de Shopify y/o una campaña, después de creado. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Editar el anclaje es de dirección." }, { status: 403 });
  }

  const { code } = await params;
  const product = await productoDeLaOrg(code, session.organizationId);
  if (!product) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  const body = (await req.json()) as {
    shopifyProductId?: string | null;
    shopifyProductTitle?: string | null;
    campaignId?: string;
  };

  const data: Record<string, unknown> = {};
  if ("shopifyProductId" in body) data.shopifyProductId = body.shopifyProductId || null;
  if ("shopifyProductTitle" in body) data.shopifyProductTitle = body.shopifyProductTitle || null;

  if (Object.keys(data).length > 0) {
    await db.product.update({ where: { id: product.id }, data });
  }

  if (body.campaignId) {
    const campana = await db.campaign.findFirst({
      where: { id: body.campaignId, adAccount: { organizationId: session.organizationId } },
      select: { id: true },
    });
    if (!campana) return NextResponse.json({ error: "Esa campaña no existe." }, { status: 404 });
    await db.campaign.update({
      where: { id: campana.id },
      data: { productId: product.id, productManual: true },
    });
  }

  return NextResponse.json({ ok: true });
}

/** Links de trackeo: agregar uno nuevo. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Editar el producto es de dirección." }, { status: 403 });
  }

  const { code } = await params;
  const product = await productoDeLaOrg(code, session.organizationId);
  if (!product) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  const body = (await req.json()) as { url?: string; etiqueta?: string };
  const url = body.url?.trim();
  if (!url) return NextResponse.json({ error: "Falta el link." }, { status: 400 });

  const link = await db.productoLink.create({
    data: { productId: product.id, url, etiqueta: body.etiqueta?.trim() || null },
  });

  return NextResponse.json({ link });
}

/** Links de trackeo: quitar uno (?linkId=). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Editar el producto es de dirección." }, { status: 403 });
  }

  const { code } = await params;
  const product = await productoDeLaOrg(code, session.organizationId);
  if (!product) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  const linkId = req.nextUrl.searchParams.get("linkId");
  if (!linkId) return NextResponse.json({ error: "Falta el link." }, { status: 400 });

  await db.productoLink.deleteMany({ where: { id: linkId, productId: product.id } });
  return NextResponse.json({ ok: true });
}
