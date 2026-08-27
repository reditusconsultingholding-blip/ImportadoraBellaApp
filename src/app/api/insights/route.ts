import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { resolveRange } from "@/lib/date-range";
import { buildInsights } from "@/lib/insights";

// El análisis se pide aparte y no dentro del renderizado de la página: una
// llamada al modelo tarda varios segundos, y no tiene sentido que el panel
// entero espere por eso. La pantalla se dibuja con los números al instante y
// el análisis aparece cuando está.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  // Habla de plata: mismo criterio que Rentabilidad.
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const range = resolveRange(
    params.get("rango") ?? undefined,
    params.get("desde") ?? undefined,
    params.get("hasta") ?? undefined
  );

  const org = await db.organization.findUnique({
    where: { id: session.organizationId },
    select: { name: true },
  });

  try {
    const insights = await buildInsights(
      session.organizationId,
      range,
      org?.name ?? "Importadora Bella"
    );
    if (!insights) {
      return NextResponse.json({
        insights: null,
        reason: process.env.ANTHROPIC_API_KEY?.trim()
          ? "Todavía no hay suficientes datos en este período para decir algo útil."
          : "Falta configurar la clave de Anthropic.",
      });
    }
    return NextResponse.json({ insights });
  } catch (err) {
    // Que falle el análisis no debe romper el panel: se devuelve el motivo y
    // la pantalla muestra el resto igual.
    return NextResponse.json({
      insights: null,
      reason: err instanceof Error ? err.message : "No se pudo generar el análisis.",
    });
  }
}
