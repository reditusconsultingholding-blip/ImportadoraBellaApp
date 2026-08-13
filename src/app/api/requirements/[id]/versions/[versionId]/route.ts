import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";

// Marca una versión como la final aprobada — desmarca cualquier otra que
// hubiera quedado marcada antes, siempre una sola por requerimiento.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Solo un Director u Administrador puede aprobar una versión." }, { status: 403 });
  }

  const { id, versionId } = await params;
  const version = await db.requirementVersion.findFirst({
    where: { id: versionId, requirementId: id, requirement: { organizationId: session.organizationId } },
  });
  if (!version) return NextResponse.json({ error: "No encontrada." }, { status: 404 });

  const { isFinal } = (await req.json()) as { isFinal?: boolean };

  if (isFinal) {
    await db.requirementVersion.updateMany({ where: { requirementId: id }, data: { isFinal: false } });
  }
  const updated = await db.requirementVersion.update({
    where: { id: versionId },
    data: { isFinal: Boolean(isFinal) },
  });

  if (isFinal) {
    await db.requirementActivity.create({
      data: {
        requirementId: id,
        actorName: session.name,
        action: "VERSION_ADDED",
        toValue: version.label,
        detail: `Aprobó ${version.label} como versión final`,
      },
    });
  }

  return NextResponse.json({ version: updated });
}
