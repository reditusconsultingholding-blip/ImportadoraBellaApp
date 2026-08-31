import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessPipeline } from "@/lib/permissions";
import { textoSinCifras, veLasCifras } from "@/lib/finanzas";
import {
  ES_TIPO,
  aprobarAccion,
  puedeDecidir,
  rechazarAccion,
} from "@/lib/product-actions";

// Acciones sobre un producto: proponer, aprobar, rechazar.
//
// Cualquiera del equipo puede proponer — el que está mirando los números suele
// ser quien primero ve el problema. Decidir es de dirección.

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const productId = req.nextUrl.searchParams.get("productId");
  const soloPendientes = req.nextUrl.searchParams.get("pendientes") === "1";

  const acciones = await db.productAction.findMany({
    where: {
      organizationId: session.organizationId,
      ...(productId ? { productId } : {}),
      ...(soloPendientes ? { status: "PROPUESTA" } : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      kind: true,
      detail: true,
      cantidad: true,
      reason: true,
      status: true,
      decisionNote: true,
      dueDate: true,
      createdAt: true,
      decidedAt: true,
      product: { select: { id: true, code: true, name: true } },
      proposedBy: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
      _count: { select: { requirements: true } },
    },
  });

  // El motivo de cada propuesta es texto guardado y puede traer el CPA o el
  // gasto adentro: si lo escribió alguien de dirección, sigue ahí aunque hoy
  // lo lea otra persona.
  const verCifras = await veLasCifras(session.userId);
  return NextResponse.json({
    acciones: acciones.map((a) => ({
      ...a,
      reason: textoSinCifras(a.reason, verCifras) ?? a.reason,
    })),
    puedoDecidir: puedeDecidir(session.role),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const { productId, kind, detail, cantidad, reason } = (await req.json()) as {
    productId?: string;
    kind?: string;
    detail?: string;
    cantidad?: number;
    reason?: string;
  };

  if (!kind || !ES_TIPO(kind)) {
    return NextResponse.json({ error: "Tipo de acción desconocido." }, { status: 400 });
  }
  if (!detail?.trim()) {
    return NextResponse.json({ error: "Falta decir qué se pide." }, { status: 400 });
  }

  const producto = productId
    ? await db.product.findUnique({
        where: { id: productId },
        select: { id: true, organizationId: true },
      })
    : null;
  if (!producto || producto.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Ese producto no existe." }, { status: 404 });
  }

  // Una acción sin motivo se vuelve imposible de decidir sin volver a mirar el
  // panel, así que si no viene uno se deja constancia de que no lo trajo.
  const motivo = reason?.trim() || "Se propuso a mano, sin un número que lo respalde.";

  const accion = await db.productAction.create({
    data: {
      organizationId: session.organizationId,
      productId: producto.id,
      kind,
      detail: detail.trim().slice(0, 300),
      cantidad:
        kind === "MAS_CREATIVOS"
          ? Math.min(Math.max(Math.round(Number(cantidad) || 1), 1), 20)
          : null,
      reason: motivo.slice(0, 500),
      proposedById: session.userId,
    },
    select: { id: true },
  });

  // Se avisa a dirección: una propuesta que nadie ve es una propuesta perdida.
  const direccion = await db.user.findMany({
    where: {
      organizationId: session.organizationId,
      role: { in: ["OWNER", "DIRECTOR"] },
      id: { not: session.userId },
    },
    select: { id: true },
  });
  if (direccion.length > 0) {
    await db.notification.create({
      data: {
        userId: direccion[0].id,
        type: "asignacion",
        message: "Hay una acción esperando aprobación en Productos.",
        link: "/dashboard/productos",
      },
    });
  }

  return NextResponse.json({ ok: true, id: accion.id });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!puedeDecidir(session.role)) {
    return NextResponse.json(
      { error: "Aprobar o rechazar es del dueño y la dirección creativa." },
      { status: 403 }
    );
  }

  const { id, decision, assigneeId, dueDate, nota } = (await req.json()) as {
    id?: string;
    decision?: "aprobar" | "rechazar";
    assigneeId?: string | null;
    dueDate?: string | null;
    nota?: string | null;
  };

  if (!id) return NextResponse.json({ error: "Falta la acción." }, { status: 400 });

  if (decision === "rechazar") {
    const r = await rechazarAccion(session, id, nota);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true });
  }

  if (decision === "aprobar") {
    const r = await aprobarAccion(session, id, { assigneeId, dueDate, nota });
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, creados: r.creados });
  }

  return NextResponse.json({ error: "Decisión desconocida." }, { status: 400 });
}
