"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Las etapas por las que pasa una pieza de contenido, en orden. Se muestran
// como una fila de pastillas: se ve dónde está y se salta a cualquiera de un
// clic, en vez de tener que abrir un desplegable para leer las opciones.
const STATUSES = [
  { value: "IDEA", label: "Idea" },
  { value: "GUION", label: "Guion" },
  { value: "GRABACION", label: "Grabación" },
  { value: "EDICION", label: "Edición" },
  { value: "REVISION", label: "Revisión" },
  { value: "APROBADO", label: "Aprobado" },
  { value: "PUBLICADO", label: "Publicado" },
];

const PRIORITIES = [
  { value: "BAJA", label: "Baja" },
  { value: "MEDIA", label: "Media" },
  { value: "ALTA", label: "Alta" },
];

const FORMATS = [
  "Vertical 9:16",
  "Cuadrado 1:1",
  "Horizontal 16:9",
  "Carrusel",
  "Imagen estática",
];

type LinkRow = { label: string; url: string };
type Person = { id: string; name: string; avatarUrl: string | null };
type Comment = {
  id: string;
  body: string;
  createdAt: string;
  author: Person;
  mine: boolean;
};

type Note = {
  id: string;
  title: string | null;
  body: string;
  status: string;
  priority: string;
  dueDate: string | null;
  format: string | null;
  durationSec: number | null;
  assignee: Person | null;
  links: LinkRow[];
  comments: Comment[];
};

const inputClass =
  "w-full border border-border rounded px-2.5 py-1.5 text-[13px] bg-surface-2 outline-none focus:border-accent focus:bg-surface";
const labelClass =
  "block text-[10px] font-semibold uppercase tracking-[0.07em] text-muted mb-1";

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function Avatar({ person, size = 24 }: { person: Person; size?: number }) {
  if (person.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={person.avatarUrl}
        alt=""
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className="grid shrink-0 place-items-center rounded-full bg-surface-2 font-semibold text-muted"
    >
      {initials(person.name)}
    </span>
  );
}

export default function NoteDrawer({
  noteId,
  people,
  canManage,
  onClose,
}: {
  noteId: string;
  people: Person[];
  canManage: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // El estado se toca dentro del .then y no en el cuerpo de una función que
  // el efecto llama derecho: sincrónicamente dispara un render de más y no
  // resiste el modo estricto de React.
  const load = useCallback(() => {
    fetch(`/api/board/notes/${noteId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return setError("No se pudo abrir la ficha.");
        setNote(data.note);
      })
      .catch(() => setError("No se pudo abrir la ficha."));
  }, [noteId]);

  useEffect(() => {
    load();
  }, [load]);

  // Escape cierra, como en cualquier panel lateral.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(patch: Record<string, unknown>) {
    if (!canManage || !note) return;
    // Se pinta el cambio de inmediato y después se guarda: esperar al servidor
    // para mover una pastilla se siente lento.
    setNote({ ...note, ...(patch as Partial<Note>) });
    setSaving(true);
    const res = await fetch(`/api/board/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar.");
      load();
      return;
    }
    setSavedAt(new Date().toLocaleTimeString("es-EC", { hour: "numeric", minute: "2-digit" }));
    router.refresh();
  }

  async function comment(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !note) return;
    const res = await fetch(`/api/board/notes/${noteId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "No se pudo comentar.");
      return;
    }
    setDraft("");
    setNote({ ...note, comments: [...note.comments, data.comment] });
  }

  function setLink(i: number, patch: Partial<LinkRow>) {
    if (!note) return;
    const links = note.links.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
    setNote({ ...note, links });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-foreground/25 backdrop-blur-[1px]"
        aria-hidden="true"
      />

      <aside className="relative flex h-full w-full max-w-[520px] flex-col overflow-y-auto border-l border-border bg-surface shadow-[var(--shadow-pop)]">
        {!note ? (
          <p className="p-6 text-sm text-muted">Abriendo…</p>
        ) : (
          <>
            <header className="sticky top-0 z-10 border-b border-border bg-surface/95 px-5 py-4 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <input
                  value={note.title ?? ""}
                  onChange={(e) => setNote({ ...note, title: e.target.value })}
                  onBlur={(e) => save({ title: e.target.value })}
                  disabled={!canManage}
                  placeholder="Sin título"
                  className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-muted/60 disabled:opacity-70"
                />
                <button
                  onClick={onClose}
                  className="shrink-0 rounded p-1 text-muted hover:bg-surface-2 hover:text-foreground"
                  title="Cerrar (Esc)"
                >
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M5 5l10 10M15 5L5 15" />
                  </svg>
                </button>
              </div>

              {/* Etapas */}
              <div className="mt-3 flex flex-wrap gap-1">
                {STATUSES.map((s) => {
                  const on = note.status === s.value;
                  return (
                    <button
                      key={s.value}
                      onClick={() => save({ status: s.value })}
                      disabled={!canManage}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-60 ${
                        on
                          ? "border-accent bg-good-bg text-accent-strong"
                          : "border-border text-muted hover:border-border-strong hover:text-foreground"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>

              <p className="mt-2 h-4 text-[11px] text-muted">
                {saving ? "Guardando…" : savedAt ? `Guardado ${savedAt}` : ""}
              </p>
            </header>

            {error && (
              <p className="mx-5 mt-3 rounded border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-5 px-5 py-5">
              {/* Campos */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={labelClass}>Fecha de entrega</span>
                  <input
                    type="date"
                    value={note.dueDate ?? ""}
                    onChange={(e) => save({ dueDate: e.target.value || null })}
                    disabled={!canManage}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>Prioridad</span>
                  <select
                    value={note.priority}
                    onChange={(e) => save({ priority: e.target.value })}
                    disabled={!canManage}
                    className={inputClass}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={labelClass}>Formato</span>
                  <select
                    value={note.format ?? ""}
                    onChange={(e) => save({ format: e.target.value })}
                    disabled={!canManage}
                    className={inputClass}
                  >
                    <option value="">— Elegir —</option>
                    {FORMATS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={labelClass}>Duración (segundos)</span>
                  <input
                    type="number"
                    min="1"
                    value={note.durationSec ?? ""}
                    onChange={(e) => setNote({ ...note, durationSec: Number(e.target.value) || null })}
                    onBlur={(e) => save({ durationSec: Number(e.target.value) || null })}
                    disabled={!canManage}
                    placeholder="30"
                    className={inputClass}
                  />
                </label>
                <label className="col-span-2 block">
                  <span className={labelClass}>Responsable</span>
                  <select
                    value={note.assignee?.id ?? ""}
                    onChange={(e) => save({ assigneeId: e.target.value || null })}
                    disabled={!canManage}
                    className={inputClass}
                  >
                    <option value="">— Sin asignar —</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Brief */}
              <label className="block">
                <span className={labelClass}>Brief — qué hay que hacer</span>
                <textarea
                  rows={4}
                  value={note.body}
                  onChange={(e) => setNote({ ...note, body: e.target.value })}
                  onBlur={(e) => save({ body: e.target.value })}
                  disabled={!canManage}
                  className={`${inputClass} resize-y leading-relaxed`}
                />
              </label>

              {/* Links */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className={`${labelClass} mb-0`}>Links</span>
                  {canManage && (
                    <button
                      onClick={() => setNote({ ...note, links: [...note.links, { label: "", url: "" }] })}
                      className="text-[11px] text-accent hover:underline"
                    >
                      + Agregar
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  {note.links.length === 0 && (
                    <p className="text-xs text-muted">
                      Referencias, material grabado, el anuncio publicado.
                    </p>
                  )}
                  {note.links.map((link, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        value={link.label}
                        onChange={(e) => setLink(i, { label: e.target.value })}
                        onBlur={() => save({ links: note.links })}
                        disabled={!canManage}
                        placeholder="Nombre"
                        className={`${inputClass} w-32 shrink-0`}
                      />
                      <input
                        value={link.url}
                        onChange={(e) => setLink(i, { url: e.target.value })}
                        onBlur={() => save({ links: note.links })}
                        disabled={!canManage}
                        placeholder="https://…"
                        className={inputClass}
                      />
                      {link.url && (
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir"
                          className="shrink-0 rounded p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
                        >
                          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 3h6v6M17 3l-8 8M15 12v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
                          </svg>
                        </a>
                      )}
                      {canManage && (
                        <button
                          onClick={() => {
                            const links = note.links.filter((_, idx) => idx !== i);
                            setNote({ ...note, links });
                            save({ links });
                          }}
                          title="Quitar"
                          className="shrink-0 rounded p-1.5 text-muted hover:text-critical"
                        >
                          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                            <path d="M5 5l10 10M15 5L5 15" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Conversación */}
              <div className="border-t border-border pt-4">
                <span className={labelClass}>Conversación</span>
                <p className="-mt-0.5 mb-3 text-xs text-muted">
                  Escribe <span className="font-medium">@nombre</span> para avisarle a alguien.
                </p>

                <div className="flex flex-col gap-3">
                  {note.comments.length === 0 && (
                    <p className="text-xs text-muted">Todavía no habló nadie de esta pieza.</p>
                  )}
                  {note.comments.map((c) => (
                    <div key={c.id} className="flex gap-2.5">
                      <Avatar person={c.author} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-baseline gap-2">
                          <span className="text-[13px] font-medium">{c.author.name}</span>
                          <span className="text-[11px] text-muted">
                            {new Date(c.createdAt).toLocaleString("es-EC", {
                              day: "numeric",
                              month: "short",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        </p>
                        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
                          {c.body}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <form onSubmit={comment} className="mt-3 flex items-end gap-2">
                  <textarea
                    rows={2}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        comment(e);
                      }
                    }}
                    placeholder="Escribe algo — @Emilia mira el guion"
                    className={`${inputClass} resize-y`}
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim()}
                    className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded bg-accent text-white transition hover:bg-accent-strong disabled:opacity-40"
                    title="Enviar"
                  >
                    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3 9 11M17 3l-5 14-3-6-6-3z" />
                    </svg>
                  </button>
                </form>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
