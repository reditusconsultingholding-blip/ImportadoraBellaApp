import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessRequirement } from "@/lib/permissions";

// Detecta @menciones por nombre (ej. "@Valentina") comparando contra los
// usuarios de la organización — sin necesidad de un @handle exacto,
// alcanza con que el nombre empiece igual.
async function findMentionedUsers(organizationId: string, body: string) {
  const handles = [...body.matchAll(/@([\p{L}0-9._-]+)/gu)].map((m) => m[1].toLowerCase());
  if (handles.length === 0) return [];

  const users = await db.user.findMany({ where: { organizationId } });
  const mentioned = new Set<string>();
  for (const handle of handles) {
    const match = users.find((u) => u.name.toLowerCase().split(/\s+/)[0] === handle || u.name.toLowerCase().replace(/\s+/g, "") === handle);
    if (match) mentioned.add(match.id);
  }
  return users.filter((u) => mentioned.has(u.id));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { id } = await params;
  const requirement = await db.requirement.findFirst({
    where: { id, organizationId: session.organizationId },
    include: { product: { select: { code: true } } },
  });
  if (!requirement) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  if (!canAccessRequirement(session, requirement)) {
    return NextResponse.json({ error: "No tienes acceso a este requerimiento." }, { status: 403 });
  }

  const { body } = (await req.json()) as { body?: string };
  if (!body?.trim()) {
    return NextResponse.json({ error: "El comentario no puede estar vacío." }, { status: 400 });
  }

  const comment = await db.comment.create({
    data: { requirementId: id, authorId: session.userId, body: body.trim() },
    include: { author: { select: { id: true, name: true } } },
  });

  const mentioned = await findMentionedUsers(session.organizationId, body);
  for (const user of mentioned) {
    if (user.id === session.userId) continue;
    await db.notification.create({
      data: {
        userId: user.id,
        message: `${session.name} te mencionó en "${requirement.adName}"`,
        link: requirement.product
          ? `/dashboard/productos/${encodeURIComponent(requirement.product.code)}?vista=pipeline`
          : "/dashboard/contenido",
      },
    });
  }

  return NextResponse.json({ comment });
}
