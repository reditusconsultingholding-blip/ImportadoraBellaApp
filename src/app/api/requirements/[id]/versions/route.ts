import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessRequirement } from "@/lib/permissions";

// Historial de iteraciones (v1, v2, v3...) de un creativo — separado del
// link "original" único que ya tenía el Requirement, para que quede
// registro de cada versión que se subió hasta que una se aprueba.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { id } = await params;
  const requirement = await db.requirement.findFirst({
    where: { id, organizationId: session.organizationId },
  });
  if (!requirement) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  if (!canAccessRequirement(session, requirement)) {
    return NextResponse.json({ error: "No tienes acceso a este requerimiento." }, { status: 403 });
  }

  const { link, note } = (await req.json()) as { link?: string; note?: string };
  if (!link?.trim()) {
    return NextResponse.json({ error: "Falta el link de la versión." }, { status: 400 });
  }

  const count = await db.requirementVersion.count({ where: { requirementId: id } });
  const version = await db.requirementVersion.create({
    data: {
      requirementId: id,
      label: `v${count + 1}`,
      link: link.trim(),
      note: note?.trim() || null,
      authorName: session.name,
    },
  });

  await db.requirementActivity.create({
    data: {
      requirementId: id,
      actorName: session.name,
      action: "VERSION_ADDED",
      toValue: version.label,
      detail: `Subió ${version.label}`,
    },
  });

  return NextResponse.json({ version });
}
