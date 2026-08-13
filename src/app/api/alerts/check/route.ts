import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { runAlertChecks } from "@/lib/alerts";

// Disparo manual del motor de alertas ("Revisar alertas ahora" en el
// Centro de notificaciones) — el mismo chequeo que corre solo en cada
// sincronización periódica (ver /api/cron/sync).
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Solo un Director u Administrador puede revisar alertas." }, { status: 403 });
  }

  const summary = await runAlertChecks(session.organizationId);
  return NextResponse.json({ summary });
}
