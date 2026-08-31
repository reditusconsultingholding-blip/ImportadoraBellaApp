"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Overview, RowMetric } from "@/lib/metrics";

// Las campañas que están corriendo, dentro del pipeline.
//
// Los números NO se vuelven a calcular acá: llegan de getOverview, la misma
// función que alimenta el panel. Si el pipeline mostrara otro gasto que el
// panel para la misma campaña, no habría forma de saber cuál creer, y la
// respuesta más probable sería "ninguno de los dos".
//
// "Activa" quiere decir que gastó dentro del período. No es el estado que
// devuelve la plataforma: una campaña puede figurar como ACTIVE y llevar dos
// semanas sin entregar una impresión, y esa no es la que hay que mirar.

const ESTADO_FILA = {
  sano: { texto: "Va bien", chip: "bg-good-bg text-good" },
  vigilar: { texto: "Optimizar", chip: "bg-surface-2 text-warning" },
  riesgo: { texto: "Va mal", chip: "bg-critical-bg text-critical" },
  "sin-objetivo": { texto: "Sin producto", chip: "bg-surface-2 text-muted" },
} as const;

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const money2 = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

type Plataforma = "META" | "TIKTOK";

const PLATAFORMAS: { id: Plataforma; label: string }[] = [
  { id: "META", label: "Meta" },
  { id: "TIKTOK", label: "TikTok" },
];

/** Qué tan lejos del objetivo está el CPA. Menor que 1 paga menos de lo que puede. */
function razon(r: RowMetric) {
  if (r.cpa == null || r.cpaTarget == null || r.cpaTarget <= 0) return null;
  return r.cpa / r.cpaTarget;
}

export default function CampanasActivas({
  meta,
  tiktok,
  periodo,
}: {
  meta: Overview;
  tiktok: Overview;
  periodo: string;
}) {
  const [plataforma, setPlataforma] = useState<Plataforma>("META");
  const [busqueda, setBusqueda] = useState("");
  const [soloProblemas, setSoloProblemas] = useState(false);

  const overview = plataforma === "META" ? meta : tiktok;

  const visibles = useMemo(() => {
    // Sin gasto no está corriendo: la fila existe porque la campaña tiene
    // métricas del período, no porque esté entregando hoy.
    const activas = overview.rows.filter((r) => r.spend > 0);
    const q = plano(busqueda.trim());
    return activas.filter((r) => {
      if (soloProblemas && r.status !== "riesgo" && r.status !== "vigilar") return false;
      if (!q) return true;
      return plano(r.name).includes(q) || (r.code != null && plano(r.code).includes(q));
    });
  }, [overview.rows, busqueda, soloProblemas]);

  const activas = overview.rows.filter((r) => r.spend > 0);
  const gastoVisible = visibles.reduce((s, r) => s + r.spend, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1">
          {PLATAFORMAS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlataforma(p.id)}
              className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
                plataforma === p.id
                  ? "bg-surface text-foreground shadow-[0_1px_2px_0_rgb(26_26_26_/_0.08)]"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar campaña o código…"
          className="min-w-[200px] rounded border border-border bg-transparent px-3 py-1.5 text-xs outline-none focus:border-accent"
        />

        <button
          onClick={() => setSoloProblemas((v) => !v)}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
            soloProblemas
              ? "border-accent bg-good-bg text-accent-strong"
              : "border-border text-muted hover:border-border-strong hover:text-foreground"
          }`}
        >
          Solo las que piden decisión
        </button>

        <span className="ml-auto text-xs text-muted">
          {visibles.length} de {activas.length} · {money(gastoVisible)}
        </span>
      </div>

      <p className="rounded border border-border bg-surface px-4 py-2.5 text-xs text-muted">
        {periodo}. Las compras y el ingreso son los que se ATRIBUYE {plataforma === "META" ? "Meta" : "TikTok"},
        no las órdenes que se cobraron: suelen ser bastantes más, porque las dos plataformas se
        cuelgan la misma venta. Lo que de verdad entró está en el Panel, y sale de Shopify.
      </p>

      <div className="overflow-hidden rounded border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-5 py-3">Producto / campaña</th>
                <th className="px-5 py-3 text-right">Gasto</th>
                <th className="px-5 py-3 text-right">Compras</th>
                <th className="px-5 py-3 text-right">Ingreso</th>
                <th className="px-5 py-3 text-right">CPA</th>
                <th className="px-5 py-3 text-right">Objetivo</th>
                <th className="px-5 py-3 text-right">vs. objetivo</th>
                <th className="px-5 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => {
                const z = razon(r);
                return (
                  <tr key={r.key} className="border-t border-border">
                    <td className="px-5 py-3">
                      {r.code ? (
                        <Link
                          href={`/dashboard/productos/${encodeURIComponent(r.code)}`}
                          className="font-medium hover:text-accent hover:underline"
                        >
                          {r.name}
                        </Link>
                      ) : (
                        <p className="font-medium leading-snug">{r.name}</p>
                      )}
                      <p className="font-mono text-xs text-muted">
                        {r.code ?? "campaña sin producto asociado"}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{money2(r.spend)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{r.purchases}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{money2(r.revenue)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {r.cpa != null ? money2(r.cpa) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted">
                      {r.cpaTarget != null ? money2(r.cpaTarget) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {z == null ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <span
                          className={z > 1.15 ? "text-critical" : z > 1 ? "text-warning" : "text-good"}
                        >
                          {z >= 1 ? "+" : "−"}
                          {Math.abs(Math.round((z - 1) * 100))}%
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 text-xs ${ESTADO_FILA[r.status].chip}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {ESTADO_FILA[r.status].texto}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-sm text-muted">
                    {activas.length === 0
                      ? "Ninguna campaña de esta plataforma gastó en el período."
                      : "Ninguna campaña coincide con el filtro."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {overview.campaignsWithoutProduct > 0 && (
        <p className="rounded border border-border bg-pending-bg px-3 py-2 text-xs text-warning">
          {overview.campaignsWithoutProduct} campañas de esta plataforma todavía no están asociadas a
          un producto, así que aparecen sueltas y sin semáforo de CPA. Se enlazan solas por el
          código que llevan en el nombre, apenas el producto exista en{" "}
          <Link href="/dashboard/productos" className="underline">
            Productos
          </Link>
          .
        </p>
      )}
    </div>
  );
}
