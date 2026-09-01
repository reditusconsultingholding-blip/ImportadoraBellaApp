"use client";

import { useEffect, useState } from "react";
import { REGLAS_DE_RONDA } from "@/lib/pipeline-options";
import { ESTADOS_LOTE, ESTADO_LOTE_LABEL } from "@/lib/contenido-opciones";

const TAMANOS = [4, 6, 12] as const;

type Pieza = {
  id: string;
  adName: string;
  slot: number | null;
  visualFormat: string;
  angle: string;
  awarenessLevel: string;
  status?: string;
  estado?: string | null;
  hookRate?: number | null;
  cpa?: number | null;
};

type Hallazgo = { regla: number; cumple: boolean; texto: string };

type Ronda = {
  id: string;
  numero: number;
  semana: string | null;
  fecha: string;
  notas: string | null;
  nomenclatura: string | null;
  tamanoObjetivo: number;
  fechaEntrega: string | null;
  estado: string;
  responsable: { id: string; name: string } | null;
  piezas: Pieza[];
  revision: { hallazgos: Hallazgo[]; cumpleTodo: boolean; duplicadas: { a: string; b: string }[] };
};

/**
 * Matrix de rondas: cuatro piezas que salen juntas a testear.
 *
 * Lo que hace útil a esto es que la diversidad se revisa ANTES de producir. Si
 * las cuatro piezas comparten formato y ángulo, compiten entre sí y la ronda
 * entera mide una sola cosa — se gastó cuatro veces el presupuesto para
 * aprender lo mismo.
 */
export default function MatrixRondas({ productId }: { productId: string }) {
  const [rondas, setRondas] = useState<Ronda[] | null>(null);
  const [sueltas, setSueltas] = useState<Pieza[]>([]);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [tamanoNuevo, setTamanoNuevo] = useState<number>(12);
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/rondas?productId=${encodeURIComponent(productId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelado) return;
        setRondas(d.rondas ?? []);
        setSueltas(d.sueltas ?? []);
        setPuedeEditar(Boolean(d.puedeEditar));
      })
      .catch(() => {
        if (!cancelado) setRondas([]);
      });
    return () => {
      cancelado = true;
    };
  }, [productId, recarga]);

  async function crearRonda() {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch("/api/rondas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, tamanoObjetivo: tamanoNuevo }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "No se pudo crear el lote.");
        return;
      }
      setRecarga((n) => n + 1);
    } finally {
      setOcupado(false);
    }
  }

  async function editarLote(id: string, cambios: Record<string, unknown>) {
    setError(null);
    const res = await fetch("/api/rondas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...cambios }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo guardar el cambio.");
      return;
    }
    setRecarga((n) => n + 1);
  }

  function copiarNomenclatura(texto: string) {
    navigator.clipboard?.writeText(texto).then(() => {
      setCopiado(texto);
      setTimeout(() => setCopiado((c) => (c === texto ? null : c)), 1500);
    });
  }

  async function mover(requirementId: string, rondaId: string | null, slot: number | null) {
    setError(null);
    const res = await fetch("/api/rondas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requirementId, rondaId, slot }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo mover la pieza.");
      return;
    }
    setRecarga((n) => n + 1);
  }

  async function borrarRonda(id: string) {
    if (!confirm("Se borra el lote. Las piezas quedan sueltas, no se pierden. ¿Sigo?")) return;
    const res = await fetch(`/api/rondas?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo borrar.");
      return;
    }
    setRecarga((n) => n + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <div>
            <h2 className="text-sm font-semibold">Lotes de contenido</h2>
            <p className="text-xs text-muted">
              Cada lote tiene su nomenclatura — cópiala al nombrar la campaña en Meta o TikTok para
              que quede a nombre de quien la hizo.
            </p>
          </div>
          {puedeEditar && (
            <div className="flex items-center gap-1.5">
              <select
                value={tamanoNuevo}
                onChange={(e) => setTamanoNuevo(Number(e.target.value))}
                title="Tamaño del lote"
                className="rounded border border-border bg-transparent px-1.5 py-1 text-xs outline-none focus:border-accent"
              >
                {TAMANOS.map((t) => (
                  <option key={t} value={t}>
                    {t} piezas
                  </option>
                ))}
              </select>
              <button
                onClick={crearRonda}
                disabled={ocupado}
                className="rounded bg-accent px-2.5 py-1 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-40"
              >
                + Nuevo lote
              </button>
            </div>
          )}
        </div>

        {error && <p className="border-b border-border px-4 py-2 text-xs text-critical">{error}</p>}

        {rondas == null ? (
          <p className="px-4 py-6 text-sm text-muted">Cargando…</p>
        ) : rondas.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted">Todavía no hay lotes armados para este producto.</p>
            <ol className="mx-auto mt-3 max-w-lg text-left">
              {REGLAS_DE_RONDA.map((r, i) => (
                <li key={i} className="flex gap-2 py-0.5 text-xs text-muted">
                  <span className="w-4 shrink-0 text-right font-mono">{i + 1}</span>
                  <span>{r}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="flex flex-col">
            {rondas.map((r) => (
              <div key={r.id} className="border-b border-border last:border-b-0">
                <div className="flex flex-wrap items-center gap-2 px-4 pt-2.5">
                  <span className="font-medium">Lote {r.numero}</span>
                  {r.nomenclatura && (
                    <button
                      onClick={() => copiarNomenclatura(r.nomenclatura as string)}
                      title="Copiar nomenclatura"
                      className="flex items-center gap-1 rounded border border-border bg-surface-2/60 px-2 py-0.5 font-mono text-xs text-accent-strong transition hover:border-accent"
                    >
                      {r.nomenclatura}
                      <span className="text-[10px] text-muted">
                        {copiado === r.nomenclatura ? "¡copiado!" : "copiar"}
                      </span>
                    </button>
                  )}
                  {r.semana && <span className="text-xs text-muted">{r.semana}</span>}
                  <span className="text-xs text-muted">
                    {r.piezas.length} de {r.tamanoObjetivo} piezas
                    {r.responsable ? ` · ${r.responsable.name}` : ""}
                  </span>

                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                      r.revision.cumpleTodo
                        ? "border-good/30 bg-good-bg text-good"
                        : "border-warning/30 bg-surface-2 text-warning"
                    }`}
                  >
                    {r.revision.cumpleTodo
                      ? "Cumple las 5 reglas"
                      : `${r.revision.hallazgos.filter((h) => !h.cumple).length} regla${
                          r.revision.hallazgos.filter((h) => !h.cumple).length === 1 ? "" : "s"
                        } sin cumplir`}
                  </span>

                  {puedeEditar && (
                    <>
                      <select
                        value={r.estado}
                        onChange={(e) => editarLote(r.id, { estado: e.target.value })}
                        className="rounded border border-border bg-transparent px-1.5 py-0.5 text-[11px] outline-none focus:border-accent"
                      >
                        {ESTADOS_LOTE.map((s) => (
                          <option key={s} value={s}>
                            {ESTADO_LOTE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={r.fechaEntrega ? r.fechaEntrega.slice(0, 10) : ""}
                        onChange={(e) => editarLote(r.id, { fechaEntrega: e.target.value || null })}
                        title="Fecha de entrega"
                        className="rounded border border-border bg-transparent px-1.5 py-0.5 text-[11px] outline-none focus:border-accent"
                      />
                    </>
                  )}

                  {puedeEditar && (
                    <button
                      onClick={() => borrarRonda(r.id)}
                      className="ml-auto text-xs text-muted transition hover:text-critical"
                      title="Borrar lote"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Los slots del lote — 4, 6 o 12 según cómo se creó. */}
                <div className="grid gap-2 px-4 py-2 sm:grid-cols-2 lg:grid-cols-4">
                  {Array.from({ length: r.tamanoObjetivo }, (_, i) => i).map((i) => {
                    const p = r.piezas[i];
                    return (
                      <div
                        key={i}
                        className="rounded border border-border bg-surface-2/40 p-2.5 text-xs"
                      >
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                          Slot {i + 1}
                        </p>
                        {p ? (
                          <>
                            <p className="truncate text-sm font-medium">{p.adName}</p>
                            <p className="mt-0.5 text-muted">{p.visualFormat || "sin formato"}</p>
                            <p className="text-muted">{p.angle || "sin ángulo"}</p>
                            <p className="text-muted">{p.awarenessLevel || "sin awareness"}</p>
                            {puedeEditar && (
                              <button
                                onClick={() => mover(p.id, null, null)}
                                className="mt-1.5 text-[10px] text-muted underline underline-offset-2 hover:text-critical"
                              >
                                Sacar del lote
                              </button>
                            )}
                          </>
                        ) : puedeEditar && sueltas.length > 0 ? (
                          <select
                            value=""
                            onChange={(e) => e.target.value && mover(e.target.value, r.id, i + 1)}
                            className="w-full rounded border border-border bg-surface px-1.5 py-1 text-xs outline-none focus:border-accent"
                          >
                            <option value="">Elegir pieza…</option>
                            {sueltas.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.adName}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-muted">Vacío</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Qué cumple y qué no. */}
                <ul className="flex flex-col gap-1 px-4 pb-3">
                  {r.revision.hallazgos.map((h) => (
                    <li key={h.regla} className="flex gap-2 text-xs leading-relaxed">
                      <span className={h.cumple ? "text-good" : "text-warning"} aria-hidden>
                        {h.cumple ? "✓" : "!"}
                      </span>
                      <span className={h.cumple ? "text-muted" : ""}>{h.texto}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {sueltas.length > 0 && (
        <p className="text-xs text-muted">
          {sueltas.length} {sueltas.length === 1 ? "pieza" : "piezas"} de este producto todavía no
          están en ningún lote.
        </p>
      )}
    </div>
  );
}
