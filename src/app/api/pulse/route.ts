import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { resolveRange } from "@/lib/date-range";
import { getPulses, pulsosVisibles } from "@/lib/pulse";
import { textoSinCifras, veLasCifras } from "@/lib/finanzas";
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

  const verCifras = await veLasCifras(session.userId);

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
  //
  // Y se recortan acá mismo: el pulso trae gasto, CPA, objetivo y la serie
  // diaria en dólares, y todo eso terminaría en el HTML de la pantalla si
  // solo se escondiera al dibujar.
  const visibles = pulsosVisibles(pulses, verCifras).map((p, i) => ({
    ...p,
    sugerencias: sugerirAcciones(pulses[i], verCifras),
  }));

  // El motivo de una propuesta es texto guardado: si la escribió alguien de
  // dirección, puede traer el CPA adentro aunque hoy la mire otra persona.
  const pendientesVisibles = pendientes.map((p) => ({
    ...p,
    reason: textoSinCifras(p.reason, verCifras) ?? p.reason,
  }));

  return NextResponse.json({
    pulses: visibles,
    verCifras,
    equipo,
    pendientes: pendientesVisibles,
    puedoDecidir: puedeDecidir(session.role),
  });
}
