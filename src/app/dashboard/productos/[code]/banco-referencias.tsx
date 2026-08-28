"use client";

import { useEffect, useState } from "react";
import {
  ANGLES,
  AWARENESS_LEVELS,
  MARKET_ORIGINS,
  VISUAL_FORMATS,
} from "@/lib/pipeline-options";

type Referencia = {
  id: string;
  fecha: string;
  codigo: string | null;
  mercadoOrigen: string | null;
  antiguedadDias: number | null;
  fuente: string | null;
  formatoVisual: string | null;
  angulo: string | null;
  awarenessLevel: string | null;
  concepto: string | null;
  antiReferencia: boolean;
  link: string | null;
  estado: string | null;
  createdBy: { id: string; name: string };
};

const ESTADOS_REF = ["Por revisar", "Aprobada", "En producción", "Usada", "Descartada"];

/**
 * Banco de referencias del producto.
 *
 * Guarda también lo que NO funcionó. Una anti-referencia vale igual que una
 * buena: saber qué ya se probó y falló evita repetirlo, y ese es el aprendizaje
 * que hoy se pierde en la cabeza de quien lo probó.
 */
export default function BancoReferencias({ productId }: { productId: string }) {
  const [refs, setRefs] = useState<Referencia[] | null>(null);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [creando, setCreando] = useState(false);
  const [soloAnti, setSoloAnti] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [f, setF] = useState({
    codigo: "",
    mercadoOrigen: "",
    antiguedadDias: "",
    fuente: "",
    formatoVisual: "",
    angulo: "",
    awarenessLevel: "",
    concepto: "",
    link: "",
    estado: "Por revisar",
    antiReferencia: false,
  });

  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/referencias?productId=${encodeURIComponent(productId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelado) return;
        setRefs(d.referencias ?? []);
        setPuedeEditar(Boolean(d.puedeEditar));
      })
      .catch(() => {
        if (!cancelado) setRefs([]);
      });
    return () => {
      cancelado = true;
    };
  }, [productId, recarga]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/referencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, ...f }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "No se pudo guardar.");
        return;
      }
      setF({
        codigo: "",
        mercadoOrigen: "",
        antiguedadDias: "",
        fuente: "",
        formatoVisual: "",
        angulo: "",
        awarenessLevel: "",
        concepto: "",
        link: "",
        estado: "Por revisar",
        antiReferencia: false,
      });
      setCreando(false);
      setRecarga((n) => n + 1);
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(id: string) {
    if (!confirm("¿Borrar esta referencia?")) return;
    const res = await fetch(`/api/referencias?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo borrar.");
      return;
    }
    setRefs((prev) => (prev ?? []).filter((r) => r.id !== id));
  }

  const visibles = (refs ?? []).filter((r) => (soloAnti ? r.antiReferencia : true));
  const antis = (refs ?? []).filter((r) => r.antiReferencia).length;

  const campo = (
    etiqueta: string,
    valor: string,
    set: (v: string) => void,
    opciones?: readonly string[]
  ) => (
    <label className="min-w-[10rem] flex-1">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
        {etiqueta}
      </span>
      {opciones ? (
        <select
          value={valor}
          onChange={(e) => set(e.target.value)}
          className="w-full rounded border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
        >
          <option value="">—</option>
          {opciones.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={valor}
          onChange={(e) => set(e.target.value)}
          className="w-full rounded border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
      )}
    </label>
  );

  return (
    <div className="rounded border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold">Banco de referencias</h2>
          <p className="text-xs text-muted">
            La materia prima del research. Guarda también lo que <strong>no</strong> funcionó:
            saber qué ya se probó y falló evita repetirlo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {antis > 0 && (
            <button
              onClick={() => setSoloAnti((v) => !v)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                soloAnti
                  ? "border-critical bg-critical-bg text-critical"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              Anti-referencias ({antis})
            </button>
          )}
          {puedeEditar && (
            <button
              onClick={() => setCreando((v) => !v)}
              className="rounded border border-border px-2.5 py-1 text-xs text-muted transition hover:border-border-strong hover:text-foreground"
            >
              + Agregar
            </button>
          )}
        </div>
      </div>

      {creando && (
        <form onSubmit={crear} className="flex flex-col gap-2 border-b border-border p-3">
          <div className="flex flex-wrap gap-2">
            {campo("Código o nombre", f.codigo, (v) => setF({ ...f, codigo: v }))}
            {campo("Mercado origen", f.mercadoOrigen, (v) => setF({ ...f, mercadoOrigen: v }), MARKET_ORIGINS)}
            {campo("Antigüedad (días)", f.antiguedadDias, (v) => setF({ ...f, antiguedadDias: v }))}
            {campo("Fuente", f.fuente, (v) => setF({ ...f, fuente: v }))}
          </div>
          <div className="flex flex-wrap gap-2">
            {campo("Formato visual", f.formatoVisual, (v) => setF({ ...f, formatoVisual: v }), VISUAL_FORMATS)}
            {campo("Ángulo", f.angulo, (v) => setF({ ...f, angulo: v }), ANGLES)}
            {campo("Nivel de consciencia", f.awarenessLevel, (v) => setF({ ...f, awarenessLevel: v }), AWARENESS_LEVELS)}
            {campo("Estado", f.estado, (v) => setF({ ...f, estado: v }), ESTADOS_REF)}
          </div>
          <input
            value={f.link}
            onChange={(e) => setF({ ...f, link: e.target.value })}
            placeholder="https://… (link a la referencia)"
            className="rounded border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
          <textarea
            value={f.concepto}
            onChange={(e) => setF({ ...f, concepto: e.target.value })}
            placeholder="Concepto extraído: qué rescatas de esta referencia"
            rows={2}
            className="resize-none rounded border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
          />

          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={f.antiReferencia}
              onChange={(e) => setF({ ...f, antiReferencia: e.target.checked })}
              className="h-3.5 w-3.5 accent-[var(--critical)]"
            />
            Es una <strong className="text-critical">anti-referencia</strong>: se probó y no
            funcionó.
          </label>

          {error && <p className="text-xs text-critical">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={guardando}
              className="rounded bg-accent px-3 py-1 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-40"
            >
              {guardando ? "Guardando…" : "Guardar referencia"}
            </button>
            <button
              type="button"
              onClick={() => setCreando(false)}
              className="text-xs text-muted transition hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {refs == null ? (
        <p className="px-4 py-6 text-sm text-muted">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">
          {soloAnti
            ? "No hay anti-referencias guardadas."
            : "Todavía no hay referencias para este producto."}
        </p>
      ) : (
        <div className="flex flex-col">
          {visibles.map((r) => (
            <div
              key={r.id}
              className={`group flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-b-0 ${
                r.antiReferencia ? "bg-critical-bg/30" : ""
              }`}
            >
              <span className="mt-px shrink-0 text-xs" aria-hidden>
                {r.antiReferencia ? "🚫" : "💡"}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm">
                  {r.link ? (
                    <a
                      href={r.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-accent-strong hover:underline"
                    >
                      {r.codigo || "Referencia sin nombre"}
                    </a>
                  ) : (
                    <span className="font-medium">{r.codigo || "Referencia sin nombre"}</span>
                  )}
                  {r.antiReferencia && (
                    <span className="rounded-full border border-critical/30 bg-critical-bg px-1.5 py-0.5 text-[10px] font-medium text-critical">
                      No funcionó
                    </span>
                  )}
                  {r.estado && (
                    <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted">
                      {r.estado}
                    </span>
                  )}
                </p>

                {r.concepto && <p className="mt-0.5 text-sm text-muted">{r.concepto}</p>}

                <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
                  {[
                    r.formatoVisual,
                    r.angulo,
                    r.awarenessLevel,
                    r.mercadoOrigen,
                    r.fuente,
                    r.antiguedadDias != null ? `${r.antiguedadDias} días` : null,
                  ]
                    .filter(Boolean)
                    .map((x, i) => (
                      <span key={i}>{x}</span>
                    ))}
                </p>
                <p className="text-[10px] text-muted">La guardó {r.createdBy.name}</p>
              </div>

              {puedeEditar && (
                <button
                  onClick={() => borrar(r.id)}
                  className="shrink-0 text-xs text-muted opacity-0 transition hover:text-critical group-hover:opacity-100"
                  title="Borrar"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
