"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Girando } from "./navegar";

type Alerta = {
  tipo: "escalar" | "apagar" | "revisar";
  productId: string;
  code: string;
  name: string;
  /**
   * Ya viene redactado según quién pregunta: con montos para la dirección,
   * con porcentajes y cantidades para el resto. Ver alertas-diarias.ts.
   */
  mensaje: string;
  gasto?: number;
  cpa?: number | null;
  equilibrio?: number;
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
  // Arranca en false: si la petición falla, el encabezado se queda del lado
  // seguro en vez de sumar montos que nunca llegaron.
  const [verCifras, setVerCifras] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [bajando, setBajando] = useState<"quieto" | "generando" | "error">("quieto");

  // Bajar esta misma lista como PDF.
  //
  // Con fetch y no con un `<a href>`: el archivo se arma en el servidor y
  // tarda unos segundos, y con un link normal no pasa nada visible en ese rato
  // —se termina apretando tres veces y son tres informes.
  async function descargar() {
    setBajando("generando");
    try {
      const res = await fetch("/api/reportes/revision");
      if (!res.ok) {
        setBajando("error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `productos-a-revisar-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setBajando("quieto");
    } catch {
      setBajando("error");
    }
  }

  useEffect(() => {
    let cancelado = false;
    fetch("/api/alertas")
      .then((r) => r.json())
      .then((d) => {
        if (cancelado) return;
        setAlertas(d.alertas ?? []);
        setVerCifras(Boolean(d.verCifras));
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

  const enJuego = apagar.reduce((s, a) => s + (a.gasto ?? 0), 0);
  const margen = escalar.reduce((s, a) => s + (a.gasto ?? 0), 0);

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
              {/* Cuánta plata hay en juego solo para quien la puede ver. La
                  cuenta de productos, que es lo que dice si hay que hacer
                  algo hoy, la ven todos. */}
              {verCifras && (
                <span className="text-muted">
                  {apagar.length > 0 ? ` · ${money(enJuego)} en juego` : ""}
                  {escalar.length > 0 ? ` · ${money(margen)} con margen` : ""}
                </span>
              )}
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

          {/* El botón va acá adentro, junto a la lista, y no arriba en la
              barra: es "bajar ESTO", no una acción suelta del panel. */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <p className="min-w-[16rem] flex-1 text-[11px] text-muted">
              Se compara el costo por venta de los últimos 7 días contra el punto de equilibrio real
              del producto —precio, costo, flete, efectividad y devoluciones—, no contra un umbral
              estimado.
            </p>
            <button
              type="button"
              onClick={descargar}
              disabled={bajando === "generando"}
              className="flex shrink-0 items-center gap-2 rounded border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-surface-2 disabled:opacity-60"
            >
              {bajando === "generando" && <Girando />}
              {bajando === "generando" ? "Generando…" : "Descargar en PDF"}
            </button>
          </div>

          {bajando === "error" && (
            <p className="px-4 pb-2.5 text-[11px] text-critical">
              No se pudo generar el informe. Volvé a intentarlo en un momento.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
