import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { generateAndStoreDailyReport } from "@/lib/daily-report";
import { veLasCifras } from "@/lib/finanzas";

// Disparo manual ("Generar el de hoy" en /dashboard/reportes) — el mismo
// generador que corre solo a medianoche vía /api/cron/daily-report.
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Solo un Director u Administrador puede generar el reporte." }, { status: 403 });
  }
  // El reporte diario es el mismo PDF con cifras: quien no las ve tampoco
  // lo dispara.
  if (!(await veLasCifras(session.userId))) {
    return NextResponse.json({ error: "El reporte con cifras lo genera la dirección." }, { status: 403 });
  }

  const report = await generateAndStoreDailyReport(session.organizationId, new Date());
  return NextResponse.json({ id: report.id, date: report.date });
}
