import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  MESSAGE_INCLUDE,
  messageWhere,
  notifyMentions,
  parseScope,
  resolveScope,
  scopeKey,
  toView,
} from "@/lib/chat";

const PAGE_SIZE = 80;
const MAX_BODY = 4000;

// GET: los mensajes de una conversación. Con ?after=<ISO> devuelve solo lo
// nuevo — es lo que usa el refresco automático para no traer todo cada vez.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const scope = parseScope(req.nextUrl.searchParams.get("scope"));
  if (!scope) return NextResponse.json({ error: "Conversación inválida." }, { status: 400 });

  const resolved = await resolveScope(session, scope);
  if (!resolved) return NextResponse.json({ error: "Conversación no encontrada." }, { status: 404 });

  const after = req.nextUrl.searchParams.get("after");
  const where = {
    ...messageWhere(session, scope),
    ...(after ? { createdAt: { gt: new Date(after) } } : {}),
  };

  const messages = await db.chatMessage.findMany({
    where,
    include: MESSAGE_INCLUDE,
    orderBy: { createdAt: after ? "asc" : "desc" },
    take: after ? PAGE_SIZE : PAGE_SIZE,
  });

  const ordered = after ? messages : messages.reverse();
  return NextResponse.json({
    title: resolved.title,
    messages: ordered.map((m) => toView(m, session.userId)),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { scope: rawScope, body, replyToId } = (await req.json()) as {
    scope?: string;
    body?: string;
    replyToId?: string | null;
  };

  const scope = parseScope(rawScope);
  if (!scope) return NextResponse.json({ error: "Conversación inválida." }, { status: 400 });

  const resolved = await resolveScope(session, scope);
  if (!resolved) return NextResponse.json({ error: "Conversación no encontrada." }, { status: 404 });

  const text = body?.trim();
  if (!text) return NextResponse.json({ error: "El mensaje está vacío." }, { status: 400 });
  if (text.length > MAX_BODY) {
    return NextResponse.json({ error: "El mensaje es demasiado largo." }, { status: 400 });
  }

  // Solo se puede responder a un mensaje de la misma conversación: si no,
  // conociendo un id se podría citar algo de un canal ajeno.
  let validReplyTo: string | null = null;
  if (replyToId) {
    const parent = await db.chatMessage.findFirst({
      where: { id: replyToId, ...messageWhere(session, scope) },
      select: { id: true },
    });
    if (parent) validReplyTo = parent.id;
  }

  const created = await db.chatMessage.create({
    data: {
      organizationId: session.organizationId,
      channelId: scope.kind === "channel" ? scope.channelId : null,
      recipientId: scope.kind === "dm" ? scope.peerId : null,
      authorId: session.userId,
      body: text,
      replyToId: validReplyTo,
    },
    include: MESSAGE_INCLUDE,
  });

  const link = `/dashboard/chat?c=${encodeURIComponent(scopeKey(scope))}`;

  if (scope.kind === "dm") {
    // En un directo no hace falta mencionar a nadie: el mensaje ya es para esa
    // persona, así que se le avisa siempre.
    await db.notification.create({
      data: {
        userId: scope.peerId,
        message: `${session.name} te escribió`,
        link,
        type: "mention",
      },
    });
  } else {
    await notifyMentions({
      body: text,
      authorId: session.userId,
      authorName: session.name,
      organizationId: session.organizationId,
      link,
      conversationTitle: resolved.title,
    });
  }

  return NextResponse.json({ ok: true, message: toView(created, session.userId) });
}

// PATCH: editar el texto propio, o fijar/desfijar un mensaje del canal.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { id, body, pinned } = (await req.json()) as {
    id?: string;
    body?: string;
    pinned?: boolean;
  };
  if (!id) return NextResponse.json({ error: "Falta el mensaje." }, { status: 400 });

  const message = await db.chatMessage.findUnique({
    where: { id },
    select: { id: true, authorId: true, organizationId: true },
  });
  if (!message || message.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Mensaje no encontrado." }, { status: 404 });
  }

  if (body !== undefined) {
    // Editar el mensaje de otro no lo puede hacer nadie, ni un administrador:
    // quedaría texto con el nombre de alguien que no lo escribió.
    if (message.authorId !== session.userId) {
      return NextResponse.json({ error: "Solo podés editar tus propios mensajes." }, { status: 403 });
    }
    const text = body.trim();
    if (!text) return NextResponse.json({ error: "El mensaje está vacío." }, { status: 400 });
    if (text.length > MAX_BODY) {
      return NextResponse.json({ error: "El mensaje es demasiado largo." }, { status: 400 });
    }
    const updated = await db.chatMessage.update({
      where: { id },
      data: { body: text, editedAt: new Date() },
      include: MESSAGE_INCLUDE,
    });
    return NextResponse.json({ ok: true, message: toView(updated, session.userId) });
  }

  if (typeof pinned === "boolean") {
    const updated = await db.chatMessage.update({
      where: { id },
      data: { pinned },
      include: MESSAGE_INCLUDE,
    });
    return NextResponse.json({ ok: true, message: toView(updated, session.userId) });
  }

  return NextResponse.json({ error: "No hay nada que cambiar." }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el mensaje." }, { status: 400 });

  const message = await db.chatMessage.findUnique({
    where: { id },
    select: { id: true, authorId: true, organizationId: true },
  });
  if (!message || message.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Mensaje no encontrado." }, { status: 404 });
  }

  // El autor borra lo suyo; un administrador puede borrar cualquier cosa del
  // canal, que es lo que hace falta para moderar.
  if (message.authorId !== session.userId && session.role !== "OWNER") {
    return NextResponse.json({ error: "No podés borrar este mensaje." }, { status: 403 });
  }

  await db.chatMessage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
