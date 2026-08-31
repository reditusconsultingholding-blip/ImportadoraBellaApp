"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ChatPins from "./chat-pins";
import { claveDia, esContinuacion, etiquetaDia, fechaHoraEc, horaEc } from "./dias";
import VoiceRoom from "./voice-room";
import AnunciosPanel from "./anuncios-panel";
import CalendarioPanel from "./calendario-panel";
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

// Cuántos mensajes se pueden tener fijados en una conversación. El tope de
// verdad lo aplica la API; acá se repite solo para no ofrecer un botón que va
// a rebotar.
const MAX_FIJADOS = 3;

function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  if (url) {
    return (
      // La foto es un data URL de 256px guardado en la base (ver el campo
      // avatarUrl de User), así que next/image no tiene nada que optimizar.
      // eslint-disable-next-line @next/next/no-img-element
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
  puedePublicarAnuncios,
}: {
  me: { id: string; name: string };
  canCreateChannels: boolean;
  isOwner: boolean;
  channels: Entry[];
  people: Entry[];
  activeScope: string | null;
  activeTitle: string | null;
  initialMessages: ChatMessageView[];
  puedePublicarAnuncios: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  // Qué apartado del chat se está mirando. Los anuncios y el calendario viven
  // acá adentro y no en pantallas propias del menú porque el equipo ya entra
  // al chat todo el día: sumarles dos entradas al menú lateral las escondería
  // más de lo que las muestra.
  const [vista, setVista] = useState<"conversacion" | "anuncios" | "calendario">("conversacion");
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
    setError(null);
    const res = await fetch("/api/chat", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: message.id, pinned: !message.pinned }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // El tope de fijados lo decide la API. Antes esto se tragaba el error y
      // el botón parecía simplemente no funcionar.
      setError(data.error ?? "No se pudo fijar el mensaje.");
      return;
    }
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

  const fijados = messages.filter((m) => m.pinned);
  const sinCupo = fijados.length >= MAX_FIJADOS;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[22px] font-semibold">Chat interno</h1>
        <p className="text-sm text-muted mt-1">
          Canales por función y mensajes directos. Escribe <span className="font-medium">@nombre</span>{" "}
          para avisarle a alguien — le llega a la campanita.
        </p>
      </div>

      {/* Las tres solapas. El calendario y los anuncios cambian la pantalla
          entera y no se meten en una columna al costado: la rejilla de un mes
          necesita el ancho, y un anuncio se lee, no se ojea. */}
      <div className="flex gap-1 border-b border-border">
        {(
          [
            ["conversacion", "Conversación"],
            ["anuncios", "Anuncios"],
            ["calendario", "Calendario"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setVista(id)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-[13px] transition ${
              vista === id
                ? "border-accent font-medium text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {vista === "anuncios" && (
        <div className="rounded border border-border bg-surface">
          <AnunciosPanel yoPuedoPublicar={puedePublicarAnuncios} />
        </div>
      )}

      {vista === "calendario" && (
        <div className="rounded border border-border bg-surface">
          <CalendarioPanel />
        </div>
      )}

      {/* La conversación se ESCONDE, no se desmonta. Adentro vive la sala de
          voz: si se desmontara, mirar el calendario un segundo cortaría la
          llamada de quien está hablando. */}
      <div
        className={`grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 items-start ${
          vista === "conversacion" ? "" : "hidden"
        }`}
      >
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
            <p className="font-medium text-sm">{activeTitle ?? "Elige una conversación"}</p>
            {fijados.length > 0 && (
              <p className="text-xs text-muted mt-0.5 truncate">
                📌 {fijados.length > 1 && <span>{fijados.length} fijados · </span>}
                {fijados[fijados.length - 1].body}
              </p>
            )}
          </header>

          {/* Sala de voz y anclados. Solo en canales: un directo no tiene
              sala, ni "lo que el equipo tiene que tener a mano". */}
          {canalActivoId && (
            <VoiceRoom
              key={`voz-${canalActivoId}`}
              channelId={canalActivoId}
              channelName={(activeTitle ?? '').replace(/^#s*/, '')}
              yo={me}
            />
          )}
          {canalActivoId && <ChatPins key={canalActivoId} channelId={canalActivoId} />}

          {error && (
            <p className="mx-4 mt-3 text-sm text-critical bg-critical-bg border border-critical/30 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <p className="text-sm text-muted text-center py-10">
                Todavía no hay mensajes aquí. Escribe el primero.
              </p>
            )}

            {messages.map((message, i) => {
              const previo = messages[i - 1];
              const nuevoDia =
                !previo || claveDia(previo.createdAt) !== claveDia(message.createdAt);
              const pegado = !nuevoDia && esContinuacion(previo, message);

              // La línea va entre BLOQUES, no entre mensajes: separa a una
              // persona de la siguiente sin rayar la conversación entera. El
              // primer bloque del día no la lleva, que ahí ya separa la fecha.
              const separador = pegado || nuevoDia ? "" : "mt-3 border-t border-border pt-3";

              return (
                <div key={message.id} className={separador}>
                  {nuevoDia && (
                    <div className={`flex items-center gap-3 ${i === 0 ? "mb-4" : "mt-5 mb-4"}`}>
                      <span className="h-px flex-1 bg-border" />
                      <span
                        className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-muted"
                        title={fechaHoraEc(message.createdAt)}
                      >
                        {etiquetaDia(message.createdAt)}
                      </span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}

                  <div
                    className={`group -mx-2 flex gap-2.5 rounded px-2 py-0.5 transition-colors hover:bg-surface-2/60 ${
                      pegado ? "mt-0.5" : ""
                    }`}
                  >
                    <div className="w-8 shrink-0">
                      {pegado ? (
                        // En los mensajes pegados la hora ocupa el hueco del
                        // avatar al pasar el mouse: así se puede saber cuándo
                        // se dijo algo sin repetir la línea del nombre.
                        <span className="hidden pt-1 text-right text-[10px] leading-none text-muted group-hover:block">
                          {horaEc(message.createdAt)}
                        </span>
                      ) : (
                        <Avatar name={message.author.name} url={message.author.avatarUrl} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      {!pegado && (
                        <p className="flex items-baseline gap-2">
                          <span className="font-medium text-[13px]">{message.author.name}</span>
                          <span
                            className="text-[11px] text-muted"
                            title={fechaHoraEc(message.createdAt)}
                          >
                            {horaEc(message.createdAt)}
                          </span>
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
                            <span
                              className="ml-1.5 align-baseline text-[11px] text-muted"
                              title={`Editado el ${fechaHoraEc(message.editedAt)}`}
                            >
                              (editado)
                            </span>
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
                          title={
                            message.pinned
                              ? "Dejar de fijar"
                              : sinCupo
                                ? `Ya hay ${MAX_FIJADOS} mensajes fijados aquí. Suelta uno para fijar este.`
                                : "Fijar"
                          }
                          inactivo={!message.pinned && sinCupo}
                          onClick={() => togglePin(message)}
                        >
                          <path d="M8 3h4l-.5 5 2.5 2.5H6L8.5 8z" />
                          <path d="M10 10.5V17" />
                        </ActionButton>
                        {/* El botón de editar se deja a la vista en gris en vez
                            de esconderlo: desaparecido parece que la app se
                            rompió, y así el texto al pasar el mouse explica por
                            qué ya no se puede. */}
                        {message.mine && (
                          <ActionButton
                            title={
                              message.editedAt
                                ? "Ya lo editaste. Cada mensaje se puede editar una sola vez."
                                : "Editar"
                            }
                            inactivo={Boolean(message.editedAt)}
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
  inactivo,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  inactivo?: boolean;
  children: React.ReactNode;
}) {
  // `aria-disabled` y no `disabled`: un botón deshabilitado de verdad no
  // recibe el mouse en varios navegadores, y entonces nadie llega a leer el
  // texto que explica por qué está apagado.
  return (
    <button
      onClick={inactivo ? undefined : onClick}
      aria-disabled={inactivo || undefined}
      title={title}
      className={`rounded px-1 py-0.5 ${
        inactivo
          ? "cursor-not-allowed text-muted opacity-40"
          : danger
            ? "text-muted hover:bg-surface-2 hover:text-critical"
            : "text-muted hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}
