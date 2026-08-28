"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Alerta = {
  tipo: "escalar" | "apagar" | "revisar";
  productId: string;
  code: string;
  name: string;
  mensaje: string;
  gasto: number;
  cpa: number | null;
  equilibrio: number;
};

const ESTILO = {
  apagar: {
    etiqueta: "Apagar",
    chip: "border-critical/30 bg-critical-bg text-critical",
    icono: "⏻",
  },
  escalar: {
    etiqueta: "Escalar",
    chip: "border-good/30 bg-good-bg text-good",
    icono: "↗",
  },
  revisar: {
    etiqueta: "Vigilar",
    chip: "border-warning/30 bg-surface-2 text-warning",
    icono: "!",
  },
} as const;

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * Qué escalar y qué apagar hoy.
 *
 * Compara el CPA real de la última semana contra el punto de equilibrio del
 * producto — precio, costo, flete, efectividad y devoluciones — no contra un
 * umbral estimado. Y usa siete días contra los siete anteriores: un mal martes
 * no es una tendencia, y apagar por un mal martes es la forma más cara de
 * equivocarse.
 */
export default function AlertasPanel() {
  const [alertas, setAlertas] = useState<Alerta[] | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/alertas")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelado) setAlertas(d.alertas ?? []);
      })
      .catch(() => {
        if (!cancelado) setAlertas([]);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const apagar = (alertas ?? []).filter((a) => a.tipo === "apagar");
  const escalar = (alertas ?? []).filter((a) => a.tipo === "escalar");
  const vigilar = (alertas ?? []).filter((a) => a.tipo === "revisar");

  // Sin nada accionable no se ocupa espacio: una tarjeta que dice "todo bien"
  // todos los días deja de mirarse, y con ella se pierden las que sí importan.
  if (alertas != null && apagar.length === 0 && escalar.length === 0) return null;

  const enJuego = apagar.reduce((s, a) => s + a.gasto, 0);
  const margen = escalar.reduce((s, a) => s + a.gasto, 0);

  return (
    <section className="overflow-hidden rounded border border-border bg-surface">
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2"
      >
        <span className="hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-muted sm:inline">
          Hoy
        </span>

        <span className="min-w-0 flex-1 truncate text-sm">
          {alertas == null ? (
            <span className="text-muted">Revisando…</span>
          ) : (
            <>
              {apagar.length > 0 && (
                <strong className="font-medium text-critical">
                  {apagar.length} para apagar
                </strong>
              )}
              {apagar.length > 0 && escalar.length > 0 && <span className="text-muted"> · </span>}
              {escalar.length > 0 && (
                <strong className="font-medium text-good">{escalar.length} para escalar</strong>
              )}
              <span className="text-muted">
                {apagar.length > 0 ? ` · ${money(enJuego)} en juego` : ""}
                {escalar.length > 0 ? ` · ${money(margen)} con margen` : ""}
              </span>
            </>
          )}
        </span>

        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
          <span className="hidden sm:inline">{abierto ? "Cerrar" : "Ver"}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden
            className={`transition-transform ${abierto ? "rotate-180" : ""}`}
          >
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      </button>

      {abierto && (
        <div className="flex flex-col border-t border-border">
          {[...apagar, ...escalar, ...vigilar].map((a) => {
            const e = ESTILO[a.tipo];
            return (
              <Link
                key={`${a.tipo}-${a.productId}`}
                href={`/dashboard/productos/${encodeURIComponent(a.code)}`}
                className="flex items-start gap-3 border-b border-border px-4 py-2.5 transition last:border-b-0 hover:bg-surface-2"
              >
                <span
                  className={`mt-px shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${e.chip}`}
                >
                  {e.icono} {e.etiqueta}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{a.name}</span>
                  <span className="block text-xs leading-relaxed text-muted">{a.mensaje}</span>
                </span>
              </Link>
            );
          })}

          <p className="px-4 py-2 text-[11px] text-muted">
            Se compara el CPA de los últimos 7 días contra el punto de equilibrio real del producto
            —precio, costo, flete, efectividad y devoluciones—, no contra un umbral estimado.
          </p>
        </div>
      )}
    </section>
  );
}
