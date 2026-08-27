import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { resolveRange } from "@/lib/date-range";
import { getPulses } from "@/lib/pulse";
import { puedeDecidir, sugerirAcciones } from "@/lib/product-actions";

// El pulso por producto, con lo que se puede hacer al respecto.
//
// Va aparte del análisis de IA a propósito: esto son números y sale al
// instante, así que no tiene por qué esperar al modelo.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const range = resolveRange(
    params.get("rango") ?? undefined,
    params.get("desde") ?? undefined,
    params.get("hasta") ?? undefined
  );

  const [pulses, equipo, pendientes] = await Promise.all([
    getPulses(session.organizationId, range),
    // A quién se le puede asignar trabajo.
    db.user.findMany({
      where: {
        organizationId: session.organizationId,
        role: { in: ["OWNER", "DIRECTOR", "EDITOR"] },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
    // Lo que está esperando una decisión, para que no quede escondido.
    db.productAction.findMany({
      where: { organizationId: session.organizationId, status: "PROPUESTA" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        kind: true,
        detail: true,
        cantidad: true,
        reason: true,
        createdAt: true,
        product: { select: { id: true, code: true, name: true } },
        proposedBy: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Las sugerencias se calculan del lado del servidor y viajan con el pulso: si
  // la pantalla las dedujera sola, el criterio viviría en dos lugares y tarde o
  // temprano dirían cosas distintas.
  const conSugerencias = pulses.map((p) => ({ ...p, sugerencias: sugerirAcciones(p) }));

  return NextResponse.json({
    pulses: conSugerencias,
    equipo,
    pendientes,
    puedoDecidir: puedeDecidir(session.role),
  });
}
