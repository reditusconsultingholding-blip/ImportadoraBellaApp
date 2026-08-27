import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { resolveRange } from "@/lib/date-range";
import { getPulses } from "@/lib/pulse";

// El pulso por producto. Va aparte del análisis de IA a propósito: esto son
// números y sale al instante, así que no tiene por qué esperar al modelo.
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

  const pulses = await getPulses(session.organizationId, range);
  return NextResponse.json({ pulses });
}
