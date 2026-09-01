import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessPipeline } from "@/lib/permissions";
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
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Todavía no tienes un rol asignado." }, { status: 403 });
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
