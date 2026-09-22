import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessPipeline } from "@/lib/permissions";
import { normalizar } from "@/lib/product-code";
import { jsonComprimido } from "@/lib/respuesta";

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
  // Activas o inactivas, como el filtro que el equipo usa en Notion. Por
  // defecto todas; la pantalla pide "activas" al abrir.
  const estado = req.nextUrl.searchParams.get("estado"); // activas | inactivas

  // Qué campaña está ENCENDIDA.
  //
  // Antes se miraba Campaign.status, que se escribe "ACTIVE" al crearla y no
  // se vuelve a tocar: Windsor no informa el estado, así que las 3.267 figuran
  // activas y el filtro "Inactivas" siempre salía vacío. Lo que el equipo
  // llama encendida es la que está gastando, así que se resuelve por el gasto
  // de los últimos siete días.
  // La ventana en la que se mira el gasto. Por defecto los últimos siete
  // días —"encendida" es lo que está gastando ahora—, pero con el período de
  // Contenido elegido se mira ESE: la pregunta pasa a ser "cuáles estuvieron
  // encendidas en esas fechas", que es lo que se quiere al revisar un mes.
  const dia = (v: string | null) =>
    v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : null;
  const desde = dia(req.nextUrl.searchParams.get("desde"));
  const hasta = dia(req.nextUrl.searchParams.get("hasta"));
  const ventana =
    desde && hasta
      ? { gte: desde, lte: new Date(hasta.getTime() + 24 * 3600_000 - 1) }
      : { gte: new Date(Date.now() - 7 * 86400_000) };

  const conGasto = await db.metricSnapshot.groupBy({
    by: ["campaignId"],
    where: {
      campaign: { adAccount: { organizationId: session.organizationId } },
      capturedAt: ventana,
      spend: { gt: 0 },
    },
    _sum: { spend: true },
  });
  const activas = new Set(conGasto.map((g) => g.campaignId));
  const gastoDe = new Map(conGasto.map((g) => [g.campaignId, g._sum.spend ?? 0]));

  const [campanas, manuales] = await Promise.all([
    db.campaign.findMany({
      where: {
        adAccount: { organizationId: session.organizationId, ...(plataforma ? { platform: plataforma as never } : {}) },
        archivada: false,
        ...(buscar
          ? {
              OR: [
                { name: { contains: buscar, mode: "insensitive" } },
                { adAccount: { name: { contains: buscar, mode: "insensitive" } } },
              ],
            }
          : {}),
        ...(soloSinProducto ? { productId: null } : {}),
        ...(estado === "activas"
          ? { id: { in: [...activas] } }
          : estado === "inactivas"
            ? { id: { notIn: [...activas] } }
            : {}),
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
        adAccount: { select: { platform: true, name: true } },
        product: { select: { id: true, code: true, name: true } },
        ronda: { select: { id: true, numero: true, nomenclatura: true, responsable: { select: { name: true } } } },
      },
    }),
    db.campanaManual.findMany({
      where: {
        organizationId: session.organizationId,
        ...(buscar ? { nombre: { contains: buscar, mode: "insensitive" } } : {}),
        ...(soloSinProducto ? { productId: null } : {}),
        ...(estado === "activas" ? { activa: true } : estado === "inactivas" ? { activa: false } : {}),
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

  campanas.sort(
    (a, b) =>
      Number(activas.has(b.id)) - Number(activas.has(a.id)) ||
      (gastoDe.get(b.id) ?? 0) - (gastoDe.get(a.id) ?? 0) ||
      a.name.localeCompare(b.name),
  );

  const nombresSincronizados = new Set(campanas.map((c) => normalizar(c.name)));
  const manualesFiltradas = manuales.filter((m) => !nombresSincronizados.has(normalizar(m.nombre)));

  return jsonComprimido({
    campanas: campanas.map((c) => ({
      id: c.id,
      origen: "sync" as const,
      nombre: c.name,
      plataforma: c.adAccount.platform,
      cuenta: c.adAccount.name,
      gasto7d: gastoDe.get(c.id) ?? 0,
      activa: activas.has(c.id),
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
