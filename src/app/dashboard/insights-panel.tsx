"use client";

import { useEffect, useState } from "react";

type Insights = {
  headline: string;
  findings: { kind: "bueno" | "alerta" | "dato"; text: string }[];
  actions: string[];
  generatedAt: string;
};

const TONE: Record<string, { dot: string; label: string }> = {
  bueno: { dot: "bg-good", label: "Bien" },
  alerta: { dot: "bg-critical", label: "Atención" },
  dato: { dot: "bg-muted", label: "Dato" },
};

export default function InsightsPanel({ query }: { query: string }) {
  const [state, setState] = useState<
    { status: "cargando" } | { status: "listo"; data: Insights } | { status: "vacio"; reason: string }
  >({ status: "cargando" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "cargando" });

    fetch(`/api/insights?${query}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.insights) setState({ status: "listo", data: data.insights });
        else setState({ status: "vacio", reason: data.reason ?? "Sin análisis por ahora." });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "vacio", reason: "No se pudo generar el análisis." });
      });

    // Si se cambia el período mientras la respuesta anterior venía en camino,
    // se descarta: si no, el análisis viejo pisaría al nuevo.
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <section className="bg-surface border border-border rounded p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-sm">Qué está pasando</h2>
          <p className="mt-0.5 text-xs text-muted">
            Lectura de los números de este período — Jarvis los interpreta, no los recalcula.
          </p>
        </div>
        {state.status === "cargando" && (
          <span className="shrink-0 text-xs text-muted">Analizando…</span>
        )}
      </div>

      {state.status === "cargando" && (
        <div className="mt-4 flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-3 animate-pulse rounded bg-surface-2"
              style={{ width: `${90 - i * 18}%` }}
            />
          ))}
        </div>
      )}

      {state.status === "vacio" && <p className="mt-3 text-sm text-muted">{state.reason}</p>}

      {state.status === "listo" && (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-[15px] font-medium leading-snug">{state.data.headline}</p>

          <ul className="flex flex-col gap-2">
            {state.data.findings.map((f, i) => {
              const tone = TONE[f.kind] ?? TONE.dato;
              return (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                  <span
                    className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`}
                    title={tone.label}
                  />
                  <span>{f.text}</span>
                </li>
              );
            })}
          </ul>

          {state.data.actions.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                Qué haría ahora
              </p>
              <ol className="mt-2 flex flex-col gap-1.5">
                {state.data.actions.map((a, i) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                    <span className="mt-px w-4 shrink-0 text-right font-mono text-xs text-muted">
                      {i + 1}
                    </span>
                    <span>{a}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
