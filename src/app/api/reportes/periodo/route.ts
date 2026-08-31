import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { resolveRange } from "@/lib/date-range";
import { construirInformeDePeriodo, nombreDelInforme } from "@/lib/reporte-periodo";

// El informe del período que se eligió en la pantalla de Reportes.
//
// Se genera al vuelo y no se guarda: los períodos son combinaciones libres de
// fechas, así que una tabla de PDF guardados acumularía uno por cada rango que
// alguien probó. El diario sí se guarda porque es siempre el mismo día y llega
// por correo.
//
// Los períodos largos tardan varios segundos: se traen las órdenes, la pauta y
// la rentabilidad de todo el rango.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json(
      { error: "Solo un Director u Administrador puede descargar informes." },
      { status: 403 }
    );
  }

  const p = req.nextUrl.searchParams;
  // resolveRange ya valida el formato y cae en los últimos 30 días si viene
  // algo raro, así que acá no hace falta repetir la validación.
  const range = resolveRange(p.get("rango") ?? undefined, p.get("desde") ?? undefined, p.get("hasta") ?? undefined);

  const pdf = await construirInformeDePeriodo(session.organizationId, range);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // "attachment" y no "inline": esto se pidió para guardar y mandar, no
      // para mirarlo en una pestaña.
      "Content-Disposition": `attachment; filename="${nombreDelInforme(range)}"`,
      // Un informe recién generado no debería servirse de una caché anterior
      // con otro período.
      "Cache-Control": "no-store",
    },
  });
}
