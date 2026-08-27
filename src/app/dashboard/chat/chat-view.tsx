"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ChatPins from "./chat-pins";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ChatMessageView } from "@/lib/chat";

const EMOJIS = ["👍", "❤️", "😂", "🎉", "👀"];

// Cada cuánto se pregunta al servidor si hay mensajes nuevos. Cuatro segundos
// se siente inmediato al escribir y no castiga la base: solo pide lo posterior
// al último mensaje que ya tiene en pantalla, no la conversación entera.
const POLL_MS = 4000;

type Entry = { id: string; name: string; scope: string; unread: boolean; avatarUrl?: string | null };

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-EC", { hour: "numeric", minute: "2-digit" });

const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" });

function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      className="grid shrink-0 place-items-center rounded-full bg-surface-2 font-semibold text-muted"
    >
      {initials(name)}
    </span>
  );
}

export default function ChatView({
  me,
  canCreateChannels,
  isOwner,
  channels,
  people,
  activeScope,
  activeTitle,
  initialMessages,
}: {
  me: { id: string; name: string };
  canCreateChannels: boolean;
  isOwner: boolean;
  channels: Entry[];
  people: Entry[];
  activeScope: string | null;
  activeTitle: string | null;
  initialMessages: ChatMessageView[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessageView | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newChannel, setNewChannel] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // El id del canal abierto, cuando lo que esta abierto es un canal. El scope
  // viaja como "channel:<id>" o "dm:<id>"; los anclados son solo de canales.
  const canalActivoId = activeScope?.startsWith("channel:")
    ? activeScope.slice("channel:".length)
    : null;

  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Cuando el servidor manda otra conversación (se cambió de canal), se
  // reemplaza lo que hay en pantalla. Se ajusta durante el render y no desde un
  // efecto: hacerlo en un efecto pinta primero los mensajes viejos bajo el
  // título nuevo y recién después los corrige.
  const [ultimasRecibidas, setUltimasRecibidas] = useState(initialMessages);
  if (initialMessages !== ultimasRecibidas) {
    setUltimasRecibidas(initialMessages);
    setMessages(initialMessages);
  }

  const scrollToBottom = useCallback((smooth = false) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeScope, scrollToBottom]);

  // Marcar leído al abrir la conversación, para que se apague el aviso.
  useEffect(() => {
    if (!activeScope) return;
    fetch("/api/chat/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: activeScope }),
    }).catch(() => {});
  }, [activeScope, messages.length]);

  // Refresco automático: pide solo lo que llegó después del último mensaje.
  useEffect(() => {
    if (!activeScope) return;
    const timer = setInterval(async () => {
      const last = messages[messages.length - 1]?.createdAt;
      const url = `/api/chat?scope=${encodeURIComponent(activeScope)}${
        last ? `&after=${encodeURIComponent(last)}` : ""
      }`;
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = (await res.json()) as { messages: ChatMessageView[] };
        if (!data.messages.length) return;
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id));
          const fresh = data.messages.filter((m) => !known.has(m.id));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      } catch {
        // Una caída de red puntual no debe romper la pantalla; se reintenta
        // en el siguiente ciclo.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [activeScope, messages]);

  // Solo se baja solo si ya estabas mirando el final: si estabas leyendo algo
  // más arriba, un mensaje nuevo no te tiene que arrastrar.
  useEffect(() => {
    const box = listRef.current;
    if (!box) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
    if (nearBottom) scrollToBottom(true);
  }, [messages, scrollToBottom]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !activeScope || sending) return;
    setSending(true);
    setError(null);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: activeScope, body: text, replyToId: replyTo?.id ?? null }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);

    if (!res.ok) {
      setError(data.error ?? "No se pudo enviar.");
      return;
    }
    setDraft("");
    setReplyTo(null);
    setMessages((prev) => [...prev, data.message]);
    requestAnimationFrame(() => scrollToBottom(true));
  }

  async function react(messageId: string, emoji: string) {
    const res = await fetch("/api/chat/reactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, emoji }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setMessages((prev) => prev.map((m) => (m.id === messageId ? data.message : m)));
  }

  async function saveEdit() {
    if (!editing) return;
    const text = editing.body.trim();
    if (!text) return;
    const res = await fetch("/api/chat", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editing.id, body: text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "No se pudo editar.");
      return;
    }
    setMessages((prev) => prev.map((m) => (m.id === editing.id ? data.message : m)));
    setEditing(null);
  }

  async function togglePin(message: ChatMessageView) {
    const res = await fetch("/api/chat", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: message.id, pinned: !message.pinned }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setMessages((prev) => prev.map((m) => (m.id === message.id ? data.message : m)));
  }

  async function remove(message: ChatMessageView) {
    if (!confirm("¿Borrar este mensaje?")) return;
    const res = await fetch(`/api/chat?id=${message.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo borrar.");
      return;
    }
    setMessages((prev) => prev.filter((m) => m.id !== message.id));
  }

  async function borrarCanal(channel: Entry) {
    // Se dice cuánto se está por perder antes de preguntar: borrar un canal se
    // lleva puesto el historial, y "¿Seguro?" a secas no alcanza para eso.
    const ok = confirm(
      `Borrar el canal ${channel.name} elimina también todos sus mensajes y lo que esté anclado. Esto no se puede deshacer.\n\n¿Lo borro igual?`
    );
    if (!ok) return;

    const res = await fetch(`/api/chat/channels?id=${encodeURIComponent(channel.id)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "No se pudo borrar el canal.");
      return;
    }
    if (activeScope === channel.scope) router.push("/dashboard/chat");
    else router.refresh();
  }

  async function createChannel(e: React.FormEvent) {
    e.preventDefault();
    const name = newChannel?.trim();
    if (!name) return;
    const res = await fetch("/api/chat/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "No se pudo crear el canal.");
      return;
    }
    setNewChannel(null);
    router.push(`/dashboard/chat?c=channel:${data.id}`);
  }

  const pinned = messages.filter((m) => m.pinned);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[22px] font-semibold">Chat interno</h1>
        <p className="text-sm text-muted mt-1">
          Canales por función y mensajes directos. Escribí <span className="font-medium">@nombre</span>{" "}
          para avisarle a alguien — le llega a la campanita.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 items-start">
        {/* Lista de conversaciones */}
        <aside className="bg-surface border border-border rounded overflow-hidden">
          <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">
              Canales
            </span>
            {canCreateChannels && (
              <button
                onClick={() => setNewChannel(newChannel === null ? "" : null)}
                title="Nuevo canal"
                className="text-muted hover:text-foreground transition text-lg leading-none px-1"
              >
                +
              </button>
            )}
          </div>

          {newChannel !== null && (
            <form onSubmit={createChannel} className="px-3 pb-2">
              <input
                autoFocus
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value)}
                placeholder="nombre del canal"
                className="w-full border border-border rounded px-2 py-1.5 text-[13px] bg-transparent outline-none focus:border-accent"
              />
            </form>
          )}

          <nav className="flex flex-col px-1.5 pb-2">
            {channels.map((channel) => (
              <div key={channel.id} className="group relative">
                <SidebarLink entry={channel} active={activeScope === channel.scope} />
                {canCreateChannels && (
                  <button
                    onClick={() => borrarCanal(channel)}
                    title={`Borrar #${channel.name}`}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1 text-xs text-muted opacity-0 transition hover:text-critical focus:opacity-100 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </nav>

          <div className="px-3 pt-1 pb-1.5 border-t border-border">
            <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">
              Mensajes directos
            </span>
          </div>
          <nav className="flex flex-col px-1.5 pb-2">
            {people.map((person) => (
              <SidebarLink
                key={person.id}
                entry={person}
                active={activeScope === person.scope}
                avatar
              />
            ))}
          </nav>
        </aside>

        {/* Conversación */}
        <section className="bg-surface border border-border rounded flex flex-col h-[calc(100vh-15rem)] min-h-[420px] overflow-hidden">
          <header className="px-4 py-3 border-b border-border shrink-0">
            <p className="font-medium text-sm">{activeTitle ?? "Elegí una conversación"}</p>
            {pinned.length > 0 && (
              <p className="text-xs text-muted mt-0.5 truncate">
                📌 {pinned[pinned.length - 1].body}
              </p>
            )}
          </header>

          {/* Notas y links anclados. Solo en canales: en un directo no hay
              "lo que el equipo tiene que tener a mano". */}
          {canalActivoId && <ChatPins key={canalActivoId} channelId={canalActivoId} />}

          {error && (
            <p className="mx-4 mt-3 text-sm text-critical bg-critical-bg border border-critical/30 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <p className="text-sm text-muted text-center py-10">
                Todavía no hay mensajes acá. Escribí el primero.
              </p>
            )}

            {messages.map((message, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || dayOf(prev.createdAt) !== dayOf(message.createdAt);
              // Mensajes seguidos de la misma persona en menos de 5 minutos se
              // agrupan: no hace falta repetir el nombre y la foto cada vez.
              const grouped =
                !newDay &&
                prev?.author.id === message.author.id &&
                new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;

              return (
                <div key={message.id}>
                  {newDay && (
                    <div className="flex items-center gap-3 my-4">
                      <span className="h-px flex-1 bg-border" />
                      <span className="text-[11px] text-muted">{dayOf(message.createdAt)}</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}

                  <div className={`group flex gap-2.5 ${grouped ? "mt-0.5" : "mt-3"}`}>
                    <div className="w-8 shrink-0">
                      {!grouped && <Avatar name={message.author.name} url={message.author.avatarUrl} />}
                    </div>

                    <div className="min-w-0 flex-1">
                      {!grouped && (
                        <p className="flex items-baseline gap-2">
                          <span className="font-medium text-[13px]">{message.author.name}</span>
                          <span className="text-[11px] text-muted">{timeOf(message.createdAt)}</span>
                        </p>
                      )}

                      {message.replyTo && (
                        <p className="mt-0.5 border-l-2 border-border pl-2 text-xs text-muted truncate">
                          <span className="font-medium">{message.replyTo.authorName}:</span>{" "}
                          {message.replyTo.body}
                        </p>
                      )}

                      {editing?.id === message.id ? (
                        <div className="mt-1 flex flex-col gap-1.5">
                          <textarea
                            autoFocus
                            rows={2}
                            value={editing.body}
                            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                            className="w-full border border-border rounded px-2 py-1.5 text-[13px] bg-transparent outline-none focus:border-accent resize-y"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={saveEdit}
                              className="text-xs font-medium bg-accent text-white rounded px-2.5 py-1"
                            >
                              Guardar
                            </button>
                            <button
                              onClick={() => setEditing(null)}
                              className="text-xs text-muted hover:text-foreground"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                          {message.body}
                          {message.editedAt && (
                            <span className="ml-1.5 text-[11px] text-muted">(editado)</span>
                          )}
                        </p>
                      )}

                      {/* Reacciones ya puestas */}
                      {message.reactions.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {message.reactions.map((r) => (
                            <button
                              key={r.emoji}
                              onClick={() => react(message.id, r.emoji)}
                              className={`rounded-full border px-1.5 py-0.5 text-[11px] transition ${
                                r.mine
                                  ? "border-accent/40 bg-good-bg text-accent-strong"
                                  : "border-border bg-surface-2 text-muted hover:border-border-strong"
                              }`}
                            >
                              {r.emoji} {r.count}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Acciones, aparecen al pasar el mouse */}
                      <div className="mt-0.5 hidden items-center gap-0.5 group-hover:flex">
                        {EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => react(message.id, emoji)}
                            title={`Reaccionar ${emoji}`}
                            className="rounded px-1 py-0.5 text-xs hover:bg-surface-2"
                          >
                            {emoji}
                          </button>
                        ))}
                        <ActionButton title="Responder" onClick={() => setReplyTo(message)}>
                          <path d="M9 5 4 10l5 5" />
                          <path d="M4 10h7a5 5 0 0 1 5 5v1" />
                        </ActionButton>
                        <ActionButton
                          title={message.pinned ? "Dejar de fijar" : "Fijar"}
                          onClick={() => togglePin(message)}
                        >
                          <path d="M8 3h4l-.5 5 2.5 2.5H6L8.5 8z" />
                          <path d="M10 10.5V17" />
                        </ActionButton>
                        {message.mine && (
                          <ActionButton
                            title="Editar"
                            onClick={() => setEditing({ id: message.id, body: message.body })}
                          >
                            <path d="M13.5 3.5a1.8 1.8 0 0 1 2.5 2.5L7 15l-3.5 1L4.5 12.5z" />
                          </ActionButton>
                        )}
                        {(message.mine || isOwner) && (
                          <ActionButton title="Borrar" onClick={() => remove(message)} danger>
                            <path d="M4 6h12M8 6V4h4v2M6.5 6l.7 10h5.6l.7-10" />
                          </ActionButton>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Redactor */}
          {activeScope && (
            <form onSubmit={send} className="shrink-0 border-t border-border p-3">
              {replyTo && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded bg-surface-2 px-2.5 py-1.5">
                  <p className="min-w-0 truncate text-xs text-muted">
                    Respondiendo a <span className="font-medium">{replyTo.author.name}</span>:{" "}
                    {replyTo.body}
                  </p>
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                    className="text-muted hover:text-foreground text-xs"
                  >
                    ✕
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter envía; Shift+Enter hace salto de línea, como en
                    // cualquier chat de trabajo.
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(e);
                    }
                  }}
                  rows={1}
                  placeholder={`Mensaje en ${activeTitle ?? ""}`}
                  className="max-h-32 min-h-[38px] flex-1 resize-y rounded border border-border bg-transparent px-3 py-2 text-[13px] outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded bg-accent text-white transition hover:bg-accent-strong disabled:opacity-40"
                  title="Enviar"
                >
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3 9 11M17 3l-5 14-3-6-6-3z" />
                  </svg>
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

function SidebarLink({
  entry,
  active,
  avatar,
}: {
  entry: Entry;
  active: boolean;
  avatar?: boolean;
}) {
  return (
    <Link
      href={`/dashboard/chat?c=${entry.scope}`}
      className={`flex items-center gap-2 rounded px-2 py-1.5 text-[13px] transition ${
        active ? "bg-surface-2 font-medium" : "text-muted hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      {avatar ? (
        <Avatar name={entry.name} url={entry.avatarUrl} size={22} />
      ) : (
        <span className="w-[22px] text-center text-muted">#</span>
      )}
      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
      {entry.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
    </Link>
  );
}

function ActionButton({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded px-1 py-0.5 hover:bg-surface-2 ${
        danger ? "text-muted hover:text-critical" : "text-muted hover:text-foreground"
      }`}
    >
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}
