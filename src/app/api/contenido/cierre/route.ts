import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { enviarCierreDeContenido } from "@/lib/cierre-contenido";

// Disparo manual del cierre de día — normalmente lo hace el reloj interno,
// pero desde acá se puede forzar (por ejemplo para probarlo).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "El cierre de día es de dirección." }, { status: 403 });
  }

  const { force } = (await req.json().catch(() => ({}))) as { force?: boolean };
  const resultado = await enviarCierreDeContenido(session.organizationId, Boolean(force));

  return NextResponse.json({ ok: true, resultado: resultado ?? "sin novedades (ya se envió, o no hubo tareas)" });
}
