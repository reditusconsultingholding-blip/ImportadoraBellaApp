"use client";

import { useEffect, useState } from "react";

type Campana = {
  id: string;
  nombre: string;
  plataforma: string;
  compras: number;
  gasto?: number;
  cpa?: number | null;
  tipoCampana: string | null;
  lote: string | null;
};

type Reporte = {
  periodo: string;
  gastoTotal?: number;
  comprasTotal: number;
  ingresoTotal?: number;
  cpaPromedio?: number | null;
  mejorCampana: Campana | null;
  peorCampana: Campana | null;
  campanas: Campana[];
  formatoWinner: { formato: string; piezas: number } | null;
  winners: number;
};

const PERIODOS: { id: "diario" | "quincenal" | "historico"; label: string }[] = [
  { id: "diario", label: "Diario" },
  { id: "quincenal", label: "Quincenal" },
  { id: "historico", label: "Histórico" },
];

const money = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("es-EC", { style: "currency", currency: "USD" });

/** Cuál campaña rinde más, qué formato es el winner, y la evolución del
 * producto en tres cortes. Lo que pidió Emilia para estudiar un producto sin
 * salir de la app. */
export default function ReporteProducto({ code }: { code: string }) {
  const [periodo, setPeriodo] = useState<"diario" | "quincenal" | "historico">("quincenal");
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/productos/${encodeURIComponent(code)}/reporte?periodo=${periodo}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelado) {
          setReporte(d?.reporte ?? null);
          setCargando(false);
        }
      })
      .catch(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [code, periodo]);

  return (
    <div className="rounded border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold">Reporte del producto</h2>
        <div className="flex gap-1">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriodo(p.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                periodo === p.id
                  ? "border-accent bg-good-bg text-accent-strong"
                  : "border-border text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {cargando ? (
        <p className="px-4 py-6 text-sm text-muted">Cargando…</p>
      ) : !reporte || reporte.campanas.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">Sin campañas con gasto en este período.</p>
      ) : (
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <div className="rounded border border-border bg-surface-2/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Mejor campaña</p>
            {reporte.mejorCampana ? (
              <>
                <p className="mt-1 truncate text-sm font-medium">{reporte.mejorCampana.nombre}</p>
                <p className="text-xs text-muted">
                  {reporte.mejorCampana.compras} compras
                  {reporte.mejorCampana.cpa != null && ` · CPA ${money(reporte.mejorCampana.cpa)}`}
                  {reporte.mejorCampana.lote && ` · Lote ${reporte.mejorCampana.lote}`}
                </p>
              </>
            ) : (
              <p className="mt-1 text-xs text-muted">Todavía sin compras en el período.</p>
            )}
          </div>

          <div className="rounded border border-border bg-surface-2/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Formato winner</p>
            {reporte.formatoWinner ? (
              <>
                <p className="mt-1 text-sm font-medium">{reporte.formatoWinner.formato}</p>
                <p className="text-xs text-muted">
                  {reporte.formatoWinner.piezas} de {reporte.winners} winners
                </p>
              </>
            ) : (
              <p className="mt-1 text-xs text-muted">Todavía no hay piezas marcadas como winner.</p>
            )}
          </div>

          <div className="rounded border border-border bg-surface-2/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Resumen del período</p>
            <p className="mt-1 text-sm font-medium">{reporte.comprasTotal} compras</p>
            {reporte.gastoTotal != null && (
              <p className="text-xs text-muted">
                {money(reporte.gastoTotal)} de gasto
                {reporte.cpaPromedio != null && ` · CPA ${money(reporte.cpaPromedio)}`}
              </p>
            )}
          </div>

          <div className="md:col-span-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
              Campañas de este producto ({reporte.campanas.length})
            </p>
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-2/60 text-left text-[10px] uppercase tracking-wide text-muted">
                    <th className="px-2.5 py-1.5">Campaña</th>
                    <th className="px-2.5 py-1.5">Plataforma</th>
                    <th className="px-2.5 py-1.5">Tipo</th>
                    <th className="px-2.5 py-1.5">Lote</th>
                    <th className="px-2.5 py-1.5">Compras</th>
                    {reporte.gastoTotal != null && <th className="px-2.5 py-1.5">CPA</th>}
                  </tr>
                </thead>
                <tbody>
                  {reporte.campanas.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-b-0">
                      <td className="max-w-[220px] truncate px-2.5 py-1.5">{c.nombre}</td>
                      <td className="px-2.5 py-1.5">{c.plataforma}</td>
                      <td className="px-2.5 py-1.5">{c.tipoCampana ?? "—"}</td>
                      <td className="px-2.5 py-1.5 font-mono">{c.lote ?? "—"}</td>
                      <td className="px-2.5 py-1.5">{c.compras}</td>
                      {reporte.gastoTotal != null && <td className="px-2.5 py-1.5">{money(c.cpa)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
