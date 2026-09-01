import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessTarea, ESTADOS_TAREA, PLATAFORMAS } from "@/lib/contenido";
import { canManagePipeline } from "@/lib/permissions";

const INCLUDE = {
  owner: { select: { id: true, name: true } },
  product: { select: { id: true, code: true, name: true } },
  lote: { select: { id: true, numero: true, nomenclatura: true } },
} as const;

const EDITABLE_FIELDS = [
  "fecha",
  "ownerId",
  "productId",
  "productoTexto",
  "plataforma",
  "campanaTiktok",
  "campanaMeta",
  "numeroCreativos",
  "estado",
  "etiquetas",
  "notas",
  "loteId",
] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { id } = await params;
  const existing = await db.tareaDiaria.findFirst({
    where: { id, organizationId: session.organizationId },
  });
  if (!existing) return NextResponse.json({ error: "No encontrada." }, { status: 404 });
  if (!canAccessTarea(session, existing)) {
    return NextResponse.json({ error: "No tienes acceso a esta tarea." }, { status: 403 });
  }

  const puedeGestionar = canManagePipeline(session.role);
  const body = (await req.json()) as Record<string, unknown>;

  if ("plataforma" in body && body.plataforma && !PLATAFORMAS.includes(body.plataforma as never)) {
    return NextResponse.json({ error: "Esa plataforma no existe." }, { status: 400 });
  }
  if ("estado" in body && body.estado && !ESTADOS_TAREA.includes(body.estado as never)) {
    return NextResponse.json({ error: "Ese estado no existe." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) continue;
    // Un editor puede mover su propia fila de estado a estado, pero no
    // reasignarla a otra persona.
    if (!puedeGestionar && field === "ownerId") continue;
    const value = body[field];
    if (field === "fecha") {
      data.fecha = value ? new Date(`${value}T00:00:00.000Z`) : null;
    } else if (field === "numeroCreativos") {
      data.numeroCreativos = Number.isFinite(value) ? Math.max(0, value as number) : 0;
    } else if (field === "campanaTiktok" || field === "campanaMeta") {
      data[field] = Boolean(value);
    } else if (field === "etiquetas") {
      data.etiquetas = Array.isArray(value) ? value.filter((e) => typeof e === "string").slice(0, 20) : [];
    } else if (typeof value === "string") {
      data[field] = value.trim() === "" ? null : value.trim();
    } else {
      data[field] = value;
    }
  }

  const tarea = await db.tareaDiaria.update({ where: { id }, data, include: INCLUDE });
  return NextResponse.json({ tarea });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { id } = await params;
  const existing = await db.tareaDiaria.findFirst({
    where: { id, organizationId: session.organizationId },
  });
  if (!existing) return NextResponse.json({ error: "No encontrada." }, { status: 404 });
  if (!canAccessTarea(session, existing)) {
    return NextResponse.json({ error: "No tienes acceso a esta tarea." }, { status: 403 });
  }

  await db.tareaDiaria.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
