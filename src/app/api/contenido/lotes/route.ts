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

  const lotes = await db.ronda.findMany({
    where: {
      organizationId: session.organizationId,
      ...(estado ? { estado } : {}),
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
