"use client";

import { useEffect, useState } from "react";

type Pin = {
  id: string;
  kind: "NOTA" | "LINK";
  title: string;
  body: string | null;
  url: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
};

const MAXIMO = 3;

/**
 * Lo anclado de un canal: hasta 3 notas o links a la vista.
 *
 * El tope de 3 es a propósito. Si se pudieran anclar veinte, dejaría de ser un
 * atajo y volvería a ser una lista que nadie mira — que es exactamente el
 * problema que resuelve.
 */
export default function ChatPins({ channelId }: { channelId: string }) {
  const [pins, setPins] = useState<Pin[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [creando, setCreando] = useState(false);
  const [tipo, setTipo] = useState<"NOTA" | "LINK">("NOTA");
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/chat/pins?channelId=${encodeURIComponent(channelId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelado) setPins(d.pins ?? []);
      })
      .catch(() => {
        if (!cancelado) setPins([]);
      });
    return () => {
      cancelado = true;
    };
  }, [channelId]);

  function limpiar() {
    setTitulo("");
    setTexto("");
    setUrl("");
    setError(null);
    setCreando(false);
  }

  async function anclar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/pins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, kind: tipo, title: titulo, body: texto, url }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "No se pudo anclar.");
        return;
      }
      setPins((prev) => [...(prev ?? []), d.pin]);
      limpiar();
      setAbierto(true);
    } finally {
      setGuardando(false);
    }
  }

  async function soltar(id: string) {
    const res = await fetch(`/api/chat/pins?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo soltar.");
      return;
    }
    setPins((prev) => (prev ?? []).filter((p) => p.id !== id));
  }

  if (pins == null) return null;

  const lleno = pins.length >= MAXIMO;

  return (
    <div className="border-b border-border bg-surface-2/50">
      <div className="flex items-center gap-2 px-4 py-1.5">
        <button
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs text-muted transition hover:text-foreground"
        >
          <span aria-hidden>📌</span>
          {pins.length === 0 ? (
            <span>Nada anclado todavía</span>
          ) : (
            <span className="truncate">
              {pins.length} {pins.length === 1 ? "anclado" : "anclados"} ·{" "}
              {pins.map((p) => p.title).join(" · ")}
            </span>
          )}
          <svg
            width="10"
            height="10"
            viewBox="0 0 12 12"
            fill="none"
            className={`shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`}
            aria-hidden
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {!lleno && (
          <button
            onClick={() => {
              setCreando(true);
              setAbierto(true);
            }}
            className="shrink-0 text-xs text-muted transition hover:text-foreground"
          >
            + Anclar
          </button>
        )}
      </div>

      {abierto && (
        <div className="flex flex-col gap-2 px-4 pb-3">
          {pins.map((p) => (
            <div
              key={p.id}
              className="flex items-start gap-2 rounded border border-border bg-surface px-2.5 py-2"
            >
              <span className="mt-px shrink-0 text-xs" aria-hidden>
                {p.kind === "LINK" ? "🔗" : "📝"}
              </span>
              <div className="min-w-0 flex-1">
                {p.kind === "LINK" && p.url ? (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm font-medium text-accent-strong hover:underline"
                  >
                    {p.title}
                  </a>
                ) : (
                  <p className="text-sm font-medium">{p.title}</p>
                )}
                {p.kind === "LINK" && p.url && (
                  <p className="truncate text-xs text-muted">{p.url}</p>
                )}
                {p.body && <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted">{p.body}</p>}
                <p className="mt-0.5 text-[10px] text-muted">Ancló {p.createdBy.name}</p>
              </div>
              <button
                onClick={() => soltar(p.id)}
                title="Soltar"
                className="shrink-0 text-xs text-muted transition hover:text-critical"
              >
                ✕
              </button>
            </div>
          ))}

          {lleno && !creando && (
            <p className="text-xs text-muted">
              Este canal ya tiene {MAXIMO} anclados. Soltá uno para anclar otro.
            </p>
          )}

          {creando && (
            <form
              onSubmit={anclar}
              className="flex flex-col gap-2 rounded border border-border bg-surface p-2.5"
            >
              <div className="flex gap-1.5">
                {(["NOTA", "LINK"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                      tipo === t
                        ? "border-accent bg-good-bg text-accent-strong"
                        : "border-border text-muted hover:text-foreground"
                    }`}
                  >
                    {t === "NOTA" ? "Nota" : "Link"}
                  </button>
                ))}
              </div>

              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Título"
                autoFocus
                className="rounded border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
              />

              {tipo === "LINK" ? (
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  className="rounded border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
                />
              ) : (
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Lo que el equipo tiene que tener a mano"
                  rows={3}
                  className="resize-none rounded border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
                />
              )}

              {error && <p className="text-xs text-critical">{error}</p>}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={guardando || !titulo.trim()}
                  className="rounded bg-accent px-3 py-1 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-40"
                >
                  {guardando ? "Anclando…" : "Anclar"}
                </button>
                <button
                  type="button"
                  onClick={limpiar}
                  className="text-xs text-muted transition hover:text-foreground"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
