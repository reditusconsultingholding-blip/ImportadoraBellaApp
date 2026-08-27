"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PulseLine, { type PulseTone } from "./pulse-line";

type Insights = {
  headline: string;
  findings: { kind: "bueno" | "alerta" | "dato"; text: string }[];
  actions: string[];
  generatedAt: string;
};

type Pulse = {
  productId: string | null;
  code: string | null;
  name: string;
  score: number;
  state: PulseTone;
  spend: number;
  purchases: number;
  cpa: number | null;
  cpaTarget: number | null;
  serie: number[];
  motivos: string[];
};

const ESTADO: Record<PulseTone, { texto: string; chip: string }> = {
  SANO: { texto: "Sano", chip: "bg-good-bg text-good border-good/30" },
  VIGILAR: { texto: "Vigilar", chip: "bg-surface-2 text-warning border-warning/30" },
  RIESGO: { texto: "En riesgo", chip: "bg-critical-bg text-critical border-critical/30" },
  SIN_DATOS: { texto: "Sin pauta", chip: "bg-surface-2 text-muted border-border" },
};

const TONO_HALLAZGO: Record<string, string> = {
  bueno: "bg-good",
  alerta: "bg-critical",
  dato: "bg-muted",
};

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * Pulso: el estado de la operación en una línea, y el detalle solo si se pide.
 *
 * Arranca cerrado a propósito. Un análisis de cinco párrafos siempre abierto
 * arriba del panel deja de leerse a la semana; una línea que dice cuántos
 * productos están en riesgo se mira todos los días.
 */
export default function PulsePanel({ query }: { query: string }) {
  const [abierto, setAbierto] = useState(false);

  // Cada resultado se guarda junto con el período al que pertenece. Así
  // "todavía no llegó" se deduce comparando — no hace falta poner el estado en
  // "cargando" desde adentro del efecto, que dispara un render de más y no
  // resiste el modo estricto de React.
  const [pulsos, setPulsos] = useState<{ q: string; data: Pulse[] } | null>(null);
  const [analisis, setAnalisis] = useState<
    { q: string; data: Insights } | { q: string; motivo: string } | null
  >(null);

  // El pulso se pide siempre: es la línea que se ve con el panel cerrado.
  useEffect(() => {
    let cancelado = false;
    fetch(`/api/pulse?${query}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelado) setPulsos({ q: query, data: d.pulses ?? [] });
      })
      .catch(() => {
        if (!cancelado) setPulsos({ q: query, data: [] });
      });
    return () => {
      cancelado = true;
    };
  }, [query]);

  // El análisis de IA solo cuando alguien abre: cuesta una llamada al modelo y
  // nadie la pidió mientras el panel estaba cerrado.
  useEffect(() => {
    if (!abierto) return;
    let cancelado = false;
    fetch(`/api/insights?${query}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelado) return;
        if (d.insights) setAnalisis({ q: query, data: d.insights });
        else setAnalisis({ q: query, motivo: d.reason ?? "Sin análisis por ahora." });
      })
      .catch(() => {
        if (!cancelado) setAnalisis({ q: query, motivo: "No se pudo generar el análisis." });
      });
    return () => {
      cancelado = true;
    };
  }, [abierto, query]);

  const pulses = pulsos?.q === query ? pulsos.data : null;
  const analisisDelPeriodo = analisis?.q === query ? analisis : null;

  const conPauta = (pulses ?? []).filter((p) => p.state !== "SIN_DATOS");
  const enRiesgo = conPauta.filter((p) => p.state === "RIESGO");
  const vigilar = conPauta.filter((p) => p.state === "VIGILAR");

  // El pulso general se pondera por gasto: un producto que se lleva la mitad
  // del presupuesto pesa la mitad del resultado.
  const gastoTotal = conPauta.reduce((a, p) => a + p.spend, 0);
  const general =
    gastoTotal > 0
      ? Math.round(conPauta.reduce((a, p) => a + p.score * p.spend, 0) / gastoTotal)
      : null;
  const estadoGeneral: PulseTone =
    general == null ? "SIN_DATOS" : general >= 70 ? "SANO" : general >= 40 ? "VIGILAR" : "RIESGO";

  // El trazo de arriba suma el gasto de todos los productos, día a día.
  const largo = Math.max(0, ...conPauta.map((p) => p.serie.length));
  const serieGeneral = Array.from({ length: largo }, (_, i) =>
    conPauta.reduce((a, p) => a + (p.serie[p.serie.length - largo + i] ?? 0), 0)
  );

  return (
    <section className="bg-surface border border-border rounded overflow-hidden">
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2"
      >
        <span className="flex items-center gap-2.5 shrink-0">
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-muted sm:inline">
            Pulso
          </span>
          <PulseLine serie={serieGeneral} state={estadoGeneral} width={72} height={22} />
          <span className="font-mono text-sm tabular-nums font-medium">
            {general == null ? "—" : general}
          </span>
        </span>

        <span className="flex-1 min-w-0 truncate text-sm">
          {pulses == null ? (
            <span className="text-muted">Midiendo…</span>
          ) : conPauta.length === 0 ? (
            <span className="text-muted">Sin pauta activa en este período.</span>
          ) : enRiesgo.length > 0 ? (
            <>
              <strong className="font-medium text-critical">
                {enRiesgo.length} {enRiesgo.length === 1 ? "producto" : "productos"} en riesgo
              </strong>
              <span className="text-muted">
                {" · "}
                {money(enRiesgo.reduce((a, p) => a + p.spend, 0))} en juego
                {vigilar.length > 0 ? ` · ${vigilar.length} a vigilar` : ""}
              </span>
            </>
          ) : vigilar.length > 0 ? (
            <span className="text-muted">
              Ninguno en riesgo · {vigilar.length}{" "}
              {vigilar.length === 1 ? "producto" : "productos"} a vigilar
            </span>
          ) : (
            <span className="text-muted">
              Los {conPauta.length} productos con pauta están dentro de su objetivo.
            </span>
          )}
        </span>

        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
          <span className="hidden sm:inline">{abierto ? "Cerrar" : "Ver análisis"}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className={`transition-transform ${abierto ? "rotate-180" : ""}`}
            aria-hidden
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </button>

      {abierto && (
        <div className="flex flex-col gap-5 border-t border-border px-4 py-4">
          {conPauta.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                Pulso por producto
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {conPauta.map((p) => (
                  <Link
                    key={p.productId ?? p.name}
                    href={p.code ? `/dashboard/productos/${encodeURIComponent(p.code)}` : "#"}
                    className="flex items-center gap-2.5 rounded border border-border px-2.5 py-2 transition hover:border-border-strong hover:bg-surface-2"
                  >
                    <PulseLine serie={p.serie} state={p.state} width={54} height={20} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{p.name}</span>
                      <span className="block text-xs tabular-nums text-muted">
                        {money(p.spend)} ·{" "}
                        {p.cpa == null ? "sin compras" : `CPA ${p.cpa.toFixed(2)}`}
                        {p.cpaTarget ? ` / obj ${p.cpaTarget.toFixed(2)}` : ""}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${ESTADO[p.state].chip}`}
                    >
                      {ESTADO[p.state].texto}
                    </span>
                    <span className="w-7 shrink-0 text-right font-mono text-sm tabular-nums">
                      {p.score}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-border pt-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
              Qué está pasando
            </p>

            {analisisDelPeriodo == null && (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-3 animate-pulse rounded bg-surface-2"
                    style={{ width: `${90 - i * 18}%` }}
                  />
                ))}
              </div>
            )}

            {analisisDelPeriodo != null && "motivo" in analisisDelPeriodo && (
              <p className="text-sm text-muted">{analisisDelPeriodo.motivo}</p>
            )}

            {analisisDelPeriodo != null && "data" in analisisDelPeriodo && (
              <div className="flex flex-col gap-4">
                <p className="text-[15px] font-medium leading-snug">
                  {analisisDelPeriodo.data.headline}
                </p>

                <ul className="flex flex-col gap-2">
                  {analisisDelPeriodo.data.findings.map((f, i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                      <span
                        className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${
                          TONO_HALLAZGO[f.kind] ?? TONO_HALLAZGO.dato
                        }`}
                      />
                      <span>{f.text}</span>
                    </li>
                  ))}
                </ul>

                {analisisDelPeriodo.data.actions.length > 0 && (
                  <div className="border-t border-border pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                      Qué haría ahora
                    </p>
                    <ol className="mt-2 flex flex-col gap-1.5">
                      {analisisDelPeriodo.data.actions.map((a, i) => (
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
          </div>
        </div>
      )}
    </section>
  );
}
