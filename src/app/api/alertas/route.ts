import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { calcularAlertasDiarias } from "@/lib/alertas-diarias";

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

  const alertas = await calcularAlertasDiarias(session.organizationId);
  return NextResponse.json({ alertas });
}
