import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { coberturaDelReporte } from "@/lib/pedidos-del-control";
import { sincronizarReporteVentas } from "@/lib/integrations/reporte-ventas";
import { rellenarCierres } from "@/lib/control-relleno";

// De dónde salen los pedidos del control, y el botón para traer la planilla
// del equipo de ventas sin esperar la vuelta de la hora.
//
// Es de dirección: trae datos de afuera y rehace los cierres, que es
// exactamente lo que no conviene que dispare cualquiera desde una pestaña
// abierta.

const dia = (v: string | null) =>
  v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : null;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const desde = dia(req.nextUrl.searchParams.get("desde"));
  const hasta = dia(req.nextUrl.searchParams.get("hasta"));
  if (!desde || !hasta) {
    return NextResponse.json({ error: "Faltan las fechas." }, { status: 400 });
  }

  const [cobertura, estado] = await Promise.all([
    coberturaDelReporte(session.organizationId, desde, hasta),
    db.syncState.findFirst({
      where: { organizationId: session.organizationId, fuente: "reporte-ventas" },
      select: { okAt: true, detalle: true },
    }),
  ]);

  // Cuántos días tiene el período, para poder decir si la planilla lo cubre
  // entero o hay que completar con Shopify.
  const diasDelPeriodo =
    Math.floor((hasta.getTime() - desde.getTime()) / (24 * 3600_000)) + 1;

  return NextResponse.json({
    dias: cobertura.dias,
    pedidos: cobertura.pedidos,
    ultimoDia: cobertura.ultimoDia?.toISOString().slice(0, 10) ?? null,
    miradaAl: estado?.okAt?.toISOString() ?? null,
    detalle: estado?.detalle ?? null,
    diasDelPeriodo,
  });
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  try {
    const r = await sincronizarReporteVentas(session.organizationId);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 502 });

    // Traer la planilla sin rehacer los cierres dejaría los números viejos en
    // pantalla y parecería que el botón no hizo nada.
    let detalle =
      r.pestanas.length === 0
        ? "Sin cambios desde la última vez."
        : `${r.pestanas.join(", ")}: ${r.filas} filas en ${r.dias} días.`;
    if (r.pestanas.length > 0) {
      const c = await rellenarCierres(session.organizationId, {
        desde: new Date(Date.now() - 7 * 24 * 3600_000),
        rehacer: true,
      });
      detalle += ` Cierres rehechos: ${c.dias}.`;
    }
    return NextResponse.json({ ok: true, detalle });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo traer la planilla." },
      { status: 502 },
    );
  }
}
