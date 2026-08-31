import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { alertasVisibles, calcularAlertasDiarias } from "@/lib/alertas-diarias";
import { veLasCifras } from "@/lib/finanzas";

// Qué escalar y qué apagar, calculado al momento.
//
// Se calcula en vivo y no se lee de las notificaciones guardadas: las
// notificaciones son el aviso de ayer, y lo que hay que mirar es el estado de
// hoy. Son dos cosas distintas y confundirlas hace tomar decisiones con datos
// viejos.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  // Qué escalar y qué apagar es justo lo que el equipo creativo tiene que
  // saber, así que la alerta se manda igual — lo que cambia es cómo está
  // redactada. Sin el permiso viaja la versión sin montos, y ni el gasto ni
  // el CPA ni el punto de equilibrio salen del servidor.
  const verCifras = await veLasCifras(session.userId);
  const alertas = await calcularAlertasDiarias(session.organizationId);
  return NextResponse.json({ alertas: alertasVisibles(alertas, verCifras), verCifras });
}
