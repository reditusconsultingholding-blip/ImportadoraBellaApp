import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessPipeline } from "@/lib/permissions";

// Vista cruzada de lotes: todos los productos a la vez, para saber qué se
// está armando esta semana sin entrar producto por producto. Crear y mover
// piezas dentro de un lote sigue siendo en la ficha del producto (Lotes ›
// Matrix de rondas) — acá es panorama, no gestión pieza por pieza.

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Todavía no tienes un rol asignado." }, { status: 403 });
  }

  const estado = req.nextUrl.searchParams.get("estado");

  // El período que se eligió arriba, común a todas las pestañas de Contenido.
  // Un lote entra si SE ENTREGA en esas fechas o, si todavía no tiene fecha de
  // entrega, si se creó en ellas: filtrar solo por la entrega escondería los
  // lotes recién armados, que son justamente los que hay que mirar.
  const dia = (v: string | null) =>
    v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : null;
  const desde = dia(req.nextUrl.searchParams.get("desde"));
  const hasta = dia(req.nextUrl.searchParams.get("hasta"));
  const hastaFin = hasta ? new Date(hasta.getTime() + 24 * 3600_000 - 1) : null;
  const enRango =
    desde && hastaFin
      ? {
          OR: [
            { fechaEntrega: { gte: desde, lte: hastaFin } },
            { AND: [{ fechaEntrega: null }, { fecha: { gte: desde, lte: hastaFin } }] },
          ],
        }
      : {};

  const lotes = await db.ronda.findMany({
    where: {
      organizationId: session.organizationId,
      ...(estado ? { estado } : {}),
      ...enRango,
    },
    orderBy: [{ fechaEntrega: "asc" }, { fecha: "desc" }],
    take: 200,
    select: {
      id: true,
      numero: true,
      nomenclatura: true,
      tamanoObjetivo: true,
      fechaEntrega: true,
      estado: true,
      semana: true,
      responsable: { select: { id: true, name: true } },
      product: { select: { id: true, code: true, name: true } },
      _count: { select: { piezas: true } },
    },
  });

  return NextResponse.json({
    lotes: lotes.map((l) => ({
      ...l,
      fechaEntrega: l.fechaEntrega ? l.fechaEntrega.toISOString() : null,
      piezas: l._count.piezas,
    })),
  });
}
