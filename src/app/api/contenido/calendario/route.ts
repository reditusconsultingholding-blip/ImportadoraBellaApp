import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessPipeline } from "@/lib/permissions";
import { calendarioContenido } from "@/lib/contenido";
import { claveMes, parsearMes } from "@/lib/calendario-fechas";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Todavía no tienes un rol asignado." }, { status: 403 });
  }

  const { anio, mes } = parsearMes(req.nextUrl.searchParams.get("mes"));
  const datos = await calendarioContenido(session.organizationId, anio, mes);

  return NextResponse.json({ mes: claveMes(anio, mes), ...datos });
}
