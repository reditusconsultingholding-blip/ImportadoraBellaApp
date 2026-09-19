import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { rendimientoDelEquipo } from "@/lib/contenido";

const OFFSET_HORAS = -5;

function localToday() {
  const now = new Date();
  const local = new Date(now.getTime() + OFFSET_HORAS * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  // Solo dirección: es el rendimiento de cada persona del equipo, puesto al
  // lado del de las demás. Emilia lo pidió así —"una sección que solo vea el
  // CEO y yo"—, y es lo que corresponde para una comparación entre compañeros.
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Rendimiento es de dirección." }, { status: 403 });
  }

  const diasRaw = Number(req.nextUrl.searchParams.get("dias"));
  const dias = Number.isFinite(diasRaw) && diasRaw > 0 && diasRaw <= 180 ? diasRaw : 30;

  const hasta = localToday();
  const desde = new Date(hasta);
  desde.setUTCDate(desde.getUTCDate() - (dias - 1));

  const verCifras = await veLasCifras(session.userId);
  const equipo = await rendimientoDelEquipo(session.organizationId, desde, hasta, verCifras);

  return NextResponse.json({ equipo, dias, verCifras });
}
