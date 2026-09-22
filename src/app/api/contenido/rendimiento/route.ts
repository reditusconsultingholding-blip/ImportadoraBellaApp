import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { rendimientoDelEquipo, responsablesSinEnlazar } from "@/lib/contenido";

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

  // Dos formas de pedir el período, y las dos hacen falta: `desde`/`hasta`
  // es la que usa el selector común de Contenido, y `dias` la que quedó
  // andando en los enlaces viejos.
  const dia = (v: string | null) =>
    v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : null;
  const pedidoDesde = dia(req.nextUrl.searchParams.get("desde"));
  const pedidoHasta = dia(req.nextUrl.searchParams.get("hasta"));

  const diasRaw = Number(req.nextUrl.searchParams.get("dias"));
  const porDias = Number.isFinite(diasRaw) && diasRaw > 0 && diasRaw <= 180 ? diasRaw : 30;

  let desde: Date;
  let hasta: Date;
  if (pedidoDesde && pedidoHasta) {
    desde = pedidoDesde;
    hasta = pedidoHasta;
  } else {
    hasta = localToday();
    desde = new Date(hasta);
    desde.setUTCDate(desde.getUTCDate() - (porDias - 1));
  }
  const dias = Math.floor((hasta.getTime() - desde.getTime()) / (24 * 3600_000)) + 1;

  const verCifras = await veLasCifras(session.userId);
  const [equipo, sinEnlazar] = await Promise.all([
    rendimientoDelEquipo(session.organizationId, desde, hasta, verCifras),
    responsablesSinEnlazar(session.organizationId, desde, hasta),
  ]);

  return NextResponse.json({ equipo, sinEnlazar, dias, verCifras });
}
