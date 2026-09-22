import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { generarRendimientoPDF } from "@/lib/reporte-rendimiento";
import { registrarActividad } from "@/lib/actividad";

// El PDF del rendimiento del equipo.
//
// Mismo permiso que la pantalla: es la comparación entre compañeros, así que
// es de dirección. A diferencia del informe de período, acá sí se arma una
// versión sin cifras —piezas, lotes y winners son el trabajo de cada uno, no
// la plata de la empresa—, que es lo mismo que ya ve la pantalla.

const OFFSET_HORAS = -5;

function hoyEcuador() {
  const local = new Date(Date.now() + OFFSET_HORAS * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Rendimiento es de dirección." }, { status: 403 });
  }

  // El PDF tiene que salir del MISMO período que la tabla que se está
  // mirando: imprimir otra cosa de la que hay en pantalla es peor que no
  // tener el botón. `dias` se sigue aceptando por los enlaces viejos.
  const dia = (v: string | null) =>
    v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : null;
  const pedidoDesde = dia(req.nextUrl.searchParams.get("desde"));
  const pedidoHasta = dia(req.nextUrl.searchParams.get("hasta"));

  const diasRaw = Number(req.nextUrl.searchParams.get("dias"));
  const porDias = Number.isFinite(diasRaw) && diasRaw > 0 && diasRaw <= 180 ? diasRaw : 30;

  let desde: Date;
  let hasta: Date;
  if (pedidoDesde && pedidoHasta) {
    desde = pedidoDesde;
    hasta = pedidoHasta;
  } else {
    hasta = hoyEcuador();
    desde = new Date(hasta);
    desde.setUTCDate(desde.getUTCDate() - (porDias - 1));
  }
  const dias = Math.floor((hasta.getTime() - desde.getTime()) / (24 * 3600_000)) + 1;

  const verCifras = await veLasCifras(session.userId);
  const { pdf, nombre } = await generarRendimientoPDF(session.organizationId, desde, hasta, verCifras);

  // Queda en la trazabilidad: bajar el rendimiento de todo el equipo es una
  // descarga de datos del personal, y el seguimiento las registra.
  registrarActividad({
    organizationId: session.organizationId,
    userId: session.userId,
    tipo: "descarga",
    detalle: `Rendimiento del equipo · últimos ${dias} días`,
    ruta: "/dashboard/contenido?vista=rendimiento",
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
