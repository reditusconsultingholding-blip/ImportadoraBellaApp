import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessPipeline } from "@/lib/permissions";
import { MESSAGE_INCLUDE, toView } from "@/lib/chat";

// Lista corta y fija a propósito: un selector de mil emojis en un chat de
// trabajo agrega ruido y ninguna de las dos cosas que importan (avisar que se
// leyó, y aprobar algo).
const ALLOWED = ["👍", "❤️", "😂", "🎉", "👀"];

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Todavía no tienes un rol asignado." }, { status: 403 });
  }

  const { messageId, emoji } = (await req.json()) as { messageId?: string; emoji?: string };
  if (!messageId || !emoji || !ALLOWED.includes(emoji)) {
    return NextResponse.json({ error: "Reacción inválida." }, { status: 400 });
  }

  const message = await db.chatMessage.findUnique({
    where: { id: messageId },
    select: { id: true, organizationId: true },
  });
  if (!message || message.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Mensaje no encontrado." }, { status: 404 });
  }

  // Es un interruptor: si ya reaccionaste con ese emoji, lo saca.
  const existing = await db.chatReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId: session.userId, emoji } },
    select: { id: true },
  });

  if (existing) {
    await db.chatReaction.delete({ where: { id: existing.id } });
  } else {
    await db.chatReaction.create({ data: { messageId, userId: session.userId, emoji } });
  }

  const updated = await db.chatMessage.findUniqueOrThrow({
    where: { id: messageId },
    include: MESSAGE_INCLUDE,
  });

  return NextResponse.json({ ok: true, message: toView(updated, session.userId) });
}
