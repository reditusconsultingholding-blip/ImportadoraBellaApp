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

  const diasRaw = Number(req.nextUrl.searchParams.get("dias"));
  const dias = Number.isFinite(diasRaw) && diasRaw > 0 && diasRaw <= 180 ? diasRaw : 30;

  const hasta = hoyEcuador();
  const desde = new Date(hasta);
  desde.setUTCDate(desde.getUTCDate() - (dias - 1));

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
