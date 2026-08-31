import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessRequirement, canManagePipeline } from "@/lib/permissions";
import { creativosSinCifras, veLasCifras } from "@/lib/finanzas";
import { REQUIREMENT_STATUSES, STATUS_LABEL } from "@/lib/pipeline-options";

async function loadOwned(id: string, organizationId: string) {
  return db.requirement.findFirst({
    where: { id, organizationId },
    include: {
      product: { select: { code: true, name: true } },
      owner: { select: { id: true, name: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true } } },
      },
      versions: { orderBy: { createdAt: "asc" } },
      activity: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { id } = await params;
  const requirement = await loadOwned(id, session.organizationId);
  if (!requirement) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  if (!canAccessRequirement(session, requirement)) {
    return NextResponse.json({ error: "No tienes acceso a este requerimiento." }, { status: 403 });
  }

  const verCifras = await veLasCifras(session.userId);
  // El flag viaja con la ficha para que el panel de detalle sepa si dibujar
  // los campos de CPA y CPM o directamente no ponerlos.
  return NextResponse.json({
    requirement: creativosSinCifras([requirement], verCifras)[0],
    verCifras,
  });
}

const EDITABLE_FIELDS = [
  "adName",
  "externalId1",
  "externalId2",
  "adType",
  "phase",
  "visualFormat",
  "angle",
  "awarenessLevel",
  "marketOrigin",
  "originalVideoLink",
  "tiktokPostLink",
  "fbPostLink",
  "hookRate",
  "ctr",
  "holdRate",
  "purchases",
  "cpa",
  "frequency",
  "cpm",
  "nextAction",
  // Estado en la pauta y ronda: son de la planilla nueva.
  "estado",
  "ronda",
  "notes",
  "status",
  "ownerId",
  "productId",
  "dueDate",
  // La fecha de la pieza, que es la primera columna de la planilla.
  "date",
  "thumbnailUrl",
] as const;

// Los campos numéricos vienen del form como string — hay que castear
// antes de guardarlos, si no Prisma tira error de tipo.
const NUMERIC_FIELDS = new Set([
  "hookRate",
  "ctr",
  "holdRate",
  "purchases",
  "cpa",
  "frequency",
  "cpm",
]);

const DATE_FIELDS = new Set(["dueDate", "date"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { id } = await params;
  const existing = await loadOwned(id, session.organizationId);
  if (!existing) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  if (!canAccessRequirement(session, existing)) {
    return NextResponse.json({ error: "No tienes acceso a este requerimiento." }, { status: 403 });
  }
  // Un Editor puede actualizar lo suyo (status, métricas, links) pero no
  // reasignar el requerimiento a otra persona ni cambiar el producto.
  const isEditorSelf = !canManagePipeline(session.role);
  const verCifras = await veLasCifras(session.userId);

  const body = (await req.json()) as Record<string, string | number | null | undefined>;
  if (body.status && !REQUIREMENT_STATUSES.includes(body.status as never)) {
    return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) continue;
    if (isEditorSelf && (field === "ownerId" || field === "productId")) continue;
    // Quien no ve el CPA ni el CPM tampoco los escribe. No es una precaución
    // de más: el panel de detalle manda todos sus campos juntos, y como a esa
    // persona los dos le llegan vacíos, guardar cualquier otra cosa borraría
    // los valores reales que cargó la dirección.
    if (!verCifras && (field === "cpa" || field === "cpm")) continue;
    const value = body[field];
    if (NUMERIC_FIELDS.has(field)) {
      data[field] = value === "" || value === null || value === undefined ? null : Number(value);
    } else if (DATE_FIELDS.has(field)) {
      data[field] = value === "" || value === null || value === undefined ? null : new Date(value as string);
    } else {
      data[field] = value === "" ? null : value;
    }
  }

  const requirement = await db.requirement.update({
    where: { id },
    data,
    include: {
      product: { select: { code: true, name: true } },
      owner: { select: { id: true, name: true } },
    },
  });

  // Bitácora: solo se registran los cambios que le importan a un director
  // (estado, asignación) — las ediciones de métricas/notas no ensucian
  // el timeline con ruido de campo por campo.
  const activityEntries: { action: string; fromValue: string | null; toValue: string | null; detail: string }[] = [];
  if ("status" in data && data.status !== existing.status) {
    activityEntries.push({
      action: "STATUS_CHANGE",
      fromValue: existing.status,
      toValue: data.status as string,
      detail: `${STATUS_LABEL[existing.status] ?? existing.status} → ${STATUS_LABEL[data.status as string] ?? data.status}`,
    });
  }
  if ("ownerId" in data && data.ownerId !== existing.ownerId) {
    const newOwner = data.ownerId ? await db.user.findUnique({ where: { id: data.ownerId as string }, select: { name: true } }) : null;
    activityEntries.push({
      action: "ASSIGNED",
      fromValue: existing.ownerId,
      toValue: (data.ownerId as string) ?? null,
      detail: newOwner ? `Reasignado a ${newOwner.name}` : "Sin asignar",
    });
  }
  for (const entry of activityEntries) {
    await db.requirementActivity.create({
      data: { requirementId: id, actorName: session.name, ...entry },
    });
  }

  return NextResponse.json({
    requirement: creativosSinCifras([requirement], verCifras)[0],
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Solo un Director u Administrador puede eliminar." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.requirement.findFirst({
    where: { id, organizationId: session.organizationId },
  });
  if (!existing) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  await db.comment.deleteMany({ where: { requirementId: id } });
  await db.requirementVersion.deleteMany({ where: { requirementId: id } });
  await db.requirementActivity.deleteMany({ where: { requirementId: id } });
  await db.requirement.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
