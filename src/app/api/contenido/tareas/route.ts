import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import { ESTADOS_TAREA, PLATAFORMAS, localToday } from "@/lib/contenido";

// El tablero de tareas diarias — reemplaza la base de Notion del mismo
// nombre. Todo el equipo con acceso al pipeline ve el tablero completo (el
// objetivo es que direción y editores miren lo mismo, no que cada quien vea
// solo lo suyo); crear/editar la propia fila es de cualquiera, tocar la de
// otra persona es de dirección.

const INCLUDE = {
  owner: { select: { id: true, name: true } },
  product: { select: { id: true, code: true, name: true } },
  lote: { select: { id: true, numero: true, nomenclatura: true } },
} as const;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Todavía no tienes un rol asignado." }, { status: 403 });
  }

  const desde = req.nextUrl.searchParams.get("desde");
  const hasta = req.nextUrl.searchParams.get("hasta");
  const soloValida = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : null);
  const fDesde = soloValida(desde);
  const fHasta = soloValida(hasta);

  const tareas = await db.tareaDiaria.findMany({
    where: {
      organizationId: session.organizationId,
      ...(fDesde || fHasta
        ? { fecha: { ...(fDesde ? { gte: fDesde } : {}), ...(fHasta ? { lte: fHasta } : {}) } }
        : {}),
    },
    include: INCLUDE,
    orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ tareas });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Todavía no tienes un rol asignado." }, { status: 403 });
  }

  const body = (await req.json()) as {
    fecha?: string;
    ownerId?: string;
    productId?: string;
    productoTexto?: string;
    plataforma?: string;
    campanaTiktok?: boolean;
    campanaMeta?: boolean;
    numeroCreativos?: number;
    estado?: string;
    etiquetas?: string[];
    notas?: string;
    loteId?: string;
  };

  const puedeGestionar = canManagePipeline(session.role);
  // Un editor solo puede crear tareas a su propio nombre — si pudiera elegir
  // otro responsable, el tablero diario dejaría de servir para saber quién
  // hizo qué.
  const ownerId = puedeGestionar ? body.ownerId?.trim() || null : session.userId;

  if (body.plataforma && !PLATAFORMAS.includes(body.plataforma as never)) {
    return NextResponse.json({ error: "Esa plataforma no existe." }, { status: 400 });
  }
  if (body.estado && !ESTADOS_TAREA.includes(body.estado as never)) {
    return NextResponse.json({ error: "Ese estado no existe." }, { status: 400 });
  }

  const fecha = body.fecha && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha)
    ? new Date(`${body.fecha}T00:00:00.000Z`)
    : localToday();

  const tarea = await db.tareaDiaria.create({
    data: {
      organizationId: session.organizationId,
      fecha,
      ownerId,
      productId: body.productId?.trim() || null,
      productoTexto: body.productoTexto?.trim() || null,
      plataforma: (body.plataforma as never) || null,
      campanaTiktok: Boolean(body.campanaTiktok),
      campanaMeta: Boolean(body.campanaMeta),
      numeroCreativos: Number.isFinite(body.numeroCreativos) ? Math.max(0, body.numeroCreativos as number) : 0,
      estado: (body.estado as never) || "PENDIENTE",
      etiquetas: Array.isArray(body.etiquetas) ? body.etiquetas.filter((e) => typeof e === "string").slice(0, 20) : [],
      notas: body.notas?.trim() || null,
      loteId: body.loteId?.trim() || null,
    },
    include: INCLUDE,
  });

  return NextResponse.json({ tarea });
}
