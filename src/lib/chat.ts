import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";

// Una conversación se identifica con una cadena: "channel:<id>" para un canal
// o "dm:<idDeLaOtraPersona>" para un mensaje directo. Sirve igual para leer
// mensajes, para marcar leído y para las URLs.
export type Scope =
  | { kind: "channel"; channelId: string }
  | { kind: "dm"; peerId: string };

export function parseScope(raw: string | null | undefined): Scope | null {
  if (!raw) return null;
  const [kind, id] = raw.split(":");
  if (!id) return null;
  if (kind === "channel") return { kind: "channel", channelId: id };
  if (kind === "dm") return { kind: "dm", peerId: id };
  return null;
}

export function scopeKey(scope: Scope) {
  return scope.kind === "channel" ? `channel:${scope.channelId}` : `dm:${scope.peerId}`;
}

// Confirma que la conversación existe y que esta persona puede verla. Un canal
// tiene que ser de su organización; un directo, con alguien de su organización.
export async function resolveScope(session: SessionPayload, scope: Scope) {
  if (scope.kind === "channel") {
    const channel = await db.chatChannel.findUnique({
      where: { id: scope.channelId },
      select: { id: true, name: true, slug: true, organizationId: true },
    });
    if (!channel || channel.organizationId !== session.organizationId) return null;
    return { scope, title: `# ${channel.name}` };
  }

  if (scope.peerId === session.userId) return null;
  const peer = await db.user.findUnique({
    where: { id: scope.peerId },
    select: { id: true, name: true, organizationId: true },
  });
  if (!peer || peer.organizationId !== session.organizationId) return null;
  return { scope, title: peer.name };
}

// El filtro de mensajes de una conversación. En un directo trae los dos
// sentidos: lo que mandé yo y lo que me mandaron.
export function messageWhere(session: SessionPayload, scope: Scope) {
  if (scope.kind === "channel") {
    return { organizationId: session.organizationId, channelId: scope.channelId };
  }
  return {
    organizationId: session.organizationId,
    channelId: null,
    OR: [
      { authorId: session.userId, recipientId: scope.peerId },
      { authorId: scope.peerId, recipientId: session.userId },
    ],
  };
}

// Cuántos mensajes puede tener fijados una conversación a la vez. Es el mismo
// tope que el de los anclados del canal (`/api/chat/pins`), a propósito: el
// equipo llama "fijados" a las dos cosas, y que una aguantara tres y la otra
// infinitas dejaba la barra de arriba como una lista que nadie mira.
export const MAX_FIJADOS = 3;

/**
 * El filtro de la conversación a la que pertenece un mensaje, deducido del
 * mensaje mismo y no de la sesión de quien pregunta. Sirve para contar lo que
 * hay fijado a su alrededor sin tener que rearmar el scope desde afuera.
 */
export function conversacionDeMensaje(message: {
  organizationId: string;
  channelId: string | null;
  authorId: string;
  recipientId: string | null;
}) {
  if (message.channelId) {
    return { organizationId: message.organizationId, channelId: message.channelId };
  }

  // Un mensaje sin canal siempre tiene destinatario; si faltara, el filtro se
  // queda en la conversación de la persona consigo misma en vez de abrirse a
  // todos los directos de la organización.
  const otro = message.recipientId ?? message.authorId;
  return {
    organizationId: message.organizationId,
    channelId: null,
    OR: [
      { authorId: message.authorId, recipientId: otro },
      { authorId: otro, recipientId: message.authorId },
    ],
  };
}

export const MESSAGE_INCLUDE = {
  author: { select: { id: true, name: true, avatarUrl: true } },
  reactions: { select: { emoji: true, userId: true } },
  replyTo: {
    select: { id: true, body: true, author: { select: { name: true } } },
  },
} as const;

export type ChatMessageView = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  pinned: boolean;
  author: { id: string; name: string; avatarUrl: string | null };
  reactions: { emoji: string; count: number; mine: boolean }[];
  replyTo: { id: string; body: string; authorName: string } | null;
  mine: boolean;
};

type RawMessage = {
  id: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  pinned: boolean;
  author: { id: string; name: string; avatarUrl: string | null };
  reactions: { emoji: string; userId: string }[];
  replyTo: { id: string; body: string; author: { name: string } } | null;
};

export function toView(message: RawMessage, viewerId: string): ChatMessageView {
  const grouped = new Map<string, { count: number; mine: boolean }>();
  for (const reaction of message.reactions) {
    const entry = grouped.get(reaction.emoji) ?? { count: 0, mine: false };
    entry.count += 1;
    if (reaction.userId === viewerId) entry.mine = true;
    grouped.set(reaction.emoji, entry);
  }

  return {
    id: message.id,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt ? message.editedAt.toISOString() : null,
    pinned: message.pinned,
    author: message.author,
    reactions: [...grouped.entries()].map(([emoji, v]) => ({ emoji, ...v })),
    replyTo: message.replyTo
      ? { id: message.replyTo.id, body: message.replyTo.body, authorName: message.replyTo.author.name }
      : null,
    mine: message.author.id === viewerId,
  };
}

// Busca @menciones en el texto y le avisa a cada persona nombrada. Se comparan
// nombres completos y primeros nombres, en minúscula y sin acentos, porque
// nadie escribe "@María José" con la tilde puesta.
const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export async function notifyMentions({
  body,
  authorId,
  authorName,
  organizationId,
  link,
  conversationTitle,
}: {
  body: string;
  authorId: string;
  authorName: string;
  organizationId: string;
  link: string;
  conversationTitle: string;
}) {
  const mentions = body.match(/@([\p{L}][\p{L}\s.'-]{1,40})/gu);
  if (!mentions?.length) return;

  const people = await db.user.findMany({
    where: { organizationId, id: { not: authorId } },
    select: { id: true, name: true },
  });

  const mentioned = new Set<string>();
  for (const raw of mentions) {
    const typed = normalize(raw.slice(1).trim());
    if (!typed) continue;
    for (const person of people) {
      const full = normalize(person.name);
      const first = full.split(" ")[0];
      // El texto tipeado tiene que empezar por el nombre de la persona: así
      // "@Maria Jose, mira esto" encuentra a María José y no a medio equipo.
      if (typed.startsWith(full) || typed === first || typed.startsWith(`${first} `)) {
        mentioned.add(person.id);
      }
    }
  }

  if (mentioned.size === 0) return;

  await db.notification.createMany({
    data: [...mentioned].map((userId) => ({
      userId,
      message: `${authorName} te mencionó en ${conversationTitle}`,
      link,
      type: "mention",
    })),
  });
}
