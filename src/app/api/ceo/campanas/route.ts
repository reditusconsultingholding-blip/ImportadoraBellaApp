import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { veLasCifras } from "@/lib/finanzas";
import { campanasDelAno } from "@/lib/ceo-campanas";
import { jsonComprimido } from "@/lib/respuesta";

// Los datos del tablero "Campañas del año" del panel CEO. Mismo cerrojo que
// la pantalla: solo el dueño, y con el permiso de finanzas.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (session.role !== "OWNER" || !(await veLasCifras(session.userId))) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }
  const pedido = Number(req.nextUrl.searchParams.get("anio"));
  const actual = new Date().getUTCFullYear();
  const anio = Number.isInteger(pedido) && pedido >= 2020 && pedido <= actual ? pedido : actual;
  return jsonComprimido(await campanasDelAno(session.organizationId, anio));
}
