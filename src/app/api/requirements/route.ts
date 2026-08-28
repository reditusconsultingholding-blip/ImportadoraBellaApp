import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import { REQUIREMENT_STATUSES } from "@/lib/pipeline-options";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Todavía no tienes un rol asignado en el pipeline." }, { status: 403 });
  }

  // Un Editor solo ve lo que tiene asignado. Owner/Director ven todo.
  const requirements = await db.requirement.findMany({
    where: {
      organizationId: session.organizationId,
      ...(canManagePipeline(session.role) ? {} : { ownerId: session.userId }),
    },
    include: {
      product: { select: { code: true, name: true } },
      owner: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ requirements });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json(
      { error: "Solo un Director u Administrador puede crear requerimientos." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const {
    productId,
    adName,
    externalId1,
    externalId2,
    adType,
    phase,
    visualFormat,
    angle,
    awarenessLevel,
    marketOrigin,
    ownerId,
    status,
    dueDate,
    thumbnailUrl,
  } = body as Record<string, string | undefined>;

  if (!adName?.trim() || !adType || !phase || !visualFormat || !angle || !awarenessLevel || !marketOrigin) {
    return NextResponse.json({ error: "Faltan campos obligatorios." }, { status: 400 });
  }
  const finalStatus = REQUIREMENT_STATUSES.includes(status as never) ? status : "PENDIENTE";

  const requirement = await db.requirement.create({
    data: {
      organizationId: session.organizationId,
      productId: productId || null,
      adName: adName.trim(),
      externalId1: externalId1 || null,
      externalId2: externalId2 || null,
      adType,
      phase,
      visualFormat,
      angle,
      awarenessLevel,
      marketOrigin,
      ownerId: ownerId || null,
      status: finalStatus as never,
      dueDate: dueDate ? new Date(dueDate) : null,
      thumbnailUrl: thumbnailUrl || null,
    },
    include: {
      product: { select: { code: true, name: true } },
      owner: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ requirement });
}
