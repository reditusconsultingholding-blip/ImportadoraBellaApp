import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessPipeline } from "@/lib/permissions";
import { normalizar } from "@/lib/product-code";

// Gestión de campañas: junta las campañas ya sincronizadas (Meta/TikTok, vía
// Windsor) con las que todavía no cruzan con ninguna (CampanaManual — filas
// planeadas o recién lanzadas que el sync de 5 minutos no levantó todavía).
// De-duplica por nombre normalizado, prefiriendo siempre la sincronizada.

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Todavía no tienes un rol asignado." }, { status: 403 });
  }

  const buscar = req.nextUrl.searchParams.get("buscar")?.trim();
  const plataforma = req.nextUrl.searchParams.get("plataforma"); // META | TIKTOK
  const soloSinProducto = req.nextUrl.searchParams.get("sinProducto") === "1";

  const [campanas, manuales] = await Promise.all([
    db.campaign.findMany({
      where: {
        adAccount: { organizationId: session.organizationId, ...(plataforma ? { platform: plataforma as never } : {}) },
        archivada: false,
        ...(buscar ? { name: { contains: buscar, mode: "insensitive" } } : {}),
        ...(soloSinProducto ? { productId: null } : {}),
      },
      orderBy: { name: "asc" },
      take: 300,
      select: {
        id: true,
        name: true,
        status: true,
        productId: true,
        productManual: true,
        tipoCampana: true,
        adAccount: { select: { platform: true } },
        product: { select: { id: true, code: true, name: true } },
        ronda: { select: { id: true, numero: true, nomenclatura: true, responsable: { select: { name: true } } } },
      },
    }),
    db.campanaManual.findMany({
      where: {
        organizationId: session.organizationId,
        ...(buscar ? { nombre: { contains: buscar, mode: "insensitive" } } : {}),
        ...(soloSinProducto ? { productId: null } : {}),
      },
      orderBy: { nombre: "asc" },
      take: 100,
      select: {
        id: true,
        nombre: true,
        activa: true,
        plataforma: true,
        productId: true,
        productoTexto: true,
        product: { select: { id: true, code: true, name: true } },
      },
    }),
  ]);

  const nombresSincronizados = new Set(campanas.map((c) => normalizar(c.name)));
  const manualesFiltradas = manuales.filter((m) => !nombresSincronizados.has(normalizar(m.nombre)));

  return NextResponse.json({
    campanas: campanas.map((c) => ({
      id: c.id,
      origen: "sync" as const,
      nombre: c.name,
      plataforma: c.adAccount.platform,
      activa: c.status === "ACTIVE",
      productId: c.productId,
      producto: c.product,
      productManual: c.productManual,
      tipoCampana: c.tipoCampana,
      lote: c.ronda,
    })),
    manuales: manualesFiltradas.map((m) => ({
      id: m.id,
      origen: "manual" as const,
      nombre: m.nombre,
      plataforma: m.plataforma,
      activa: m.activa,
      productId: m.productId,
      producto: m.product,
      productoTexto: m.productoTexto,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Todavía no tienes un rol asignado." }, { status: 403 });
  }

  // Alta manual: una campaña planeada, para trackearla antes de que exista en
  // Meta/TikTok (o mientras el sync de 5 minutos la encuentra).
  const body = (await req.json()) as { nombre?: string; productId?: string; productoTexto?: string; plataforma?: string };
  if (!body.nombre?.trim()) {
    return NextResponse.json({ error: "Ponle un nombre a la campaña." }, { status: 400 });
  }

  const manual = await db.campanaManual.create({
    data: {
      organizationId: session.organizationId,
      nombre: body.nombre.trim(),
      productId: body.productId?.trim() || null,
      productoTexto: body.productoTexto?.trim() || null,
      plataforma: body.plataforma?.trim() || null,
    },
  });

  return NextResponse.json({ manual });
}
