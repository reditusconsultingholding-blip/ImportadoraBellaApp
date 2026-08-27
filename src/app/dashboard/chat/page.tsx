import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessPipeline } from "@/lib/permissions";
import {
  MESSAGE_INCLUDE,
  messageWhere,
  parseScope,
  resolveScope,
  scopeKey,
  toView,
} from "@/lib/chat";
import ChatView from "./chat-view";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  // El chat interno es la conversación del equipo. Alguien recién registrado,
  // sin rol asignado todavía, no tiene por qué leerla ni escribirle a nadie.
  if (!canAccessPipeline(session.role)) {
    return (
      <div className="bg-surface border border-border rounded p-6 max-w-lg">
        <p className="text-sm text-muted">
          Todavía no tenés un rol asignado, así que no podés entrar al chat del equipo. Un
          administrador tiene que asignártelo desde Usuarios.
        </p>
      </div>
    );
  }

  const { c } = await searchParams;

  const [channels, people, reads] = await Promise.all([
    db.chatChannel.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    db.user.findMany({
      where: { organizationId: session.organizationId, id: { not: session.userId } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, avatarUrl: true },
    }),
    db.chatRead.findMany({
      where: { userId: session.userId },
      select: { scope: true, readAt: true },
    }),
  ]);

  const readAt = new Map(reads.map((r) => [r.scope, r.readAt]));

  // Cuándo fue el último mensaje de cada conversación, para saber cuáles
  // tienen algo sin leer. Se agrupa en dos consultas en vez de una por canal.
  const [lastByChannel, lastByAuthor] = await Promise.all([
    db.chatMessage.groupBy({
      by: ["channelId"],
      where: { organizationId: session.organizationId, channelId: { not: null } },
      _max: { createdAt: true },
    }),
    db.chatMessage.groupBy({
      by: ["authorId"],
      where: {
        organizationId: session.organizationId,
        channelId: null,
        recipientId: session.userId,
      },
      _max: { createdAt: true },
    }),
  ]);

  const lastChannel = new Map(
    lastByChannel.map((row) => [row.channelId as string, row._max.createdAt])
  );
  const lastDm = new Map(lastByAuthor.map((row) => [row.authorId, row._max.createdAt]));

  function unread(key: string, last: Date | null | undefined) {
    if (!last) return false;
    const seen = readAt.get(key);
    return !seen || last > seen;
  }

  const channelList = channels.map((channel) => ({
    id: channel.id,
    name: channel.name,
    scope: `channel:${channel.id}`,
    unread: unread(`channel:${channel.id}`, lastChannel.get(channel.id)),
  }));

  const peopleList = people.map((person) => ({
    id: person.id,
    name: person.name,
    avatarUrl: person.avatarUrl,
    scope: `dm:${person.id}`,
    unread: unread(`dm:${person.id}`, lastDm.get(person.id)),
  }));

  // Sin conversación elegida se abre el primer canal, que es donde va a estar
  // la conversación general del equipo.
  const requested = parseScope(c) ?? parseScope(channelList[0]?.scope);
  const resolved = requested ? await resolveScope(session, requested) : null;

  let messages: ReturnType<typeof toView>[] = [];
  if (resolved) {
    const rows = await db.chatMessage.findMany({
      where: messageWhere(session, resolved.scope),
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 80,
    });
    messages = rows.reverse().map((m) => toView(m, session.userId));
  }

  return (
    <ChatView
      me={{ id: session.userId, name: session.name }}
      canCreateChannels={session.role === "OWNER" || session.role === "DIRECTOR"}
      isOwner={session.role === "OWNER"}
      channels={channelList}
      people={peopleList}
      activeScope={resolved ? scopeKey(resolved.scope) : null}
      activeTitle={resolved?.title ?? null}
      initialMessages={messages}
    />
  );
}
