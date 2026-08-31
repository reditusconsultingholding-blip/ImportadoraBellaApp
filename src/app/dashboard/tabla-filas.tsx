"use client";

import { useState } from "react";
import Link from "next/link";
import type { RowMetric } from "@/lib/metrics";

// La tabla de producto y campaña, con filtro.
//
// Antes venía ordenada por gasto y punto. Con 2.700 campañas eso responde
// "¿dónde se está yendo la plata?" pero no "¿qué está mal?" — y lo segundo es
// lo que se mira todos los días.
//
// El orden que importa no es el gasto sino CUÁNTO SE ALEJA DEL OBJETIVO. Una
// campaña que gasta $2.000 a la mitad de su CPA objetivo no es un problema;
// una que gasta $200 al doble, sí.

const ESTADO_FILA = {
  sano: { texto: "Va bien", chip: "bg-good-bg text-good" },
  vigilar: { texto: "Optimizar", chip: "bg-surface-2 text-warning" },
  riesgo: { texto: "Va mal", chip: "bg-critical-bg text-critical" },
  "sin-objetivo": { texto: "Sin producto", chip: "bg-surface-2 text-muted" },
} as const;

const money2 = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

type Filtro = "gasto" | "mejores" | "peores" | "revisar";

const FILTROS: { id: Filtro; label: string; ayuda: string }[] = [
  { id: "gasto", label: "Más gasto", ayuda: "Dónde se está yendo la plata" },
  { id: "mejores", label: "Las mejores", ayuda: "Las que más lejos están de su techo de CPA" },
  { id: "peores", label: "Las peores", ayuda: "Las que más se pasan de su CPA objetivo" },
  { id: "revisar", label: "Solo las que van mal", ayuda: "Las que piden una decisión hoy" },
];

/**
 * Qué tan lejos está el CPA del objetivo.
 *
 * Menor que 1 es que paga menos de lo que puede; mayor que 1 es que se pasa.
 * Se compara la RAZÓN y no la resta porque un exceso de $3 es grave en un
 * producto de CPA $4 y despreciable en uno de CPA $30.
 */
function razon(r: RowMetric) {
  if (r.cpa == null || r.cpaTarget == null || r.cpaTarget <= 0) return null;
  return r.cpa / r.cpaTarget;
}

function ordenar(filas: RowMetric[], filtro: Filtro) {
  if (filtro === "gasto") return filas;

  // Las que no tienen objetivo no se pueden juzgar: quedan al final en vez de
  // colarse arriba como si fueran las mejores.
  const conObjetivo = filas.filter((f) => razon(f) != null);
  const sinObjetivo = filas.filter((f) => razon(f) == null);

  if (filtro === "revisar") {
    return conObjetivo
      .filter((f) => f.status === "riesgo" || f.status === "vigilar")
      .sort((a, b) => razon(b)! - razon(a)!);
  }

  const ordenadas = [...conObjetivo].sort((a, b) =>
    filtro === "peores" ? razon(b)! - razon(a)! : razon(a)! - razon(b)!
  );
  return [...ordenadas, ...sinObjetivo];
}

export default function TablaFilas({
  filas,
  puedeAbrirProducto,
}: {
  filas: RowMetric[];
  puedeAbrirProducto: boolean;
}) {
  const [filtro, setFiltro] = useState<Filtro>("gasto");
  const visibles = ordenar(filas, filtro);
  const ayuda = FILTROS.find((f) => f.id === filtro)?.ayuda;

  return (
    <div className="overflow-hidden rounded border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold">Por producto y campaña</h2>
        <span className="ml-auto flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              title={f.ayuda}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                filtro === f.id
                  ? "border-accent bg-good-bg text-accent-strong"
                  : "border-border text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </span>
      </div>

      {ayuda && (
        <p className="border-b border-border px-5 py-2 text-xs text-muted">
          {ayuda}
          {filtro === "revisar" && ` · ${visibles.length} de ${filas.length}`}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="table-cols w-full min-w-[760px] text-sm">
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
                    {r.code && puedeAbrirProducto ? (
                      <Link
                        href={`/dashboard/productos/${r.code}`}
                        className="font-medium hover:text-accent hover:underline"
                      >
                        {r.name}
                      </Link>
                    ) : (
                      <p className="font-medium leading-snug">{r.name}</p>
                    )}
                    {r.code && <p className="font-mono text-xs text-muted">{r.code}</p>}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{money2(r.spend)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{r.purchases}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{money2(r.revenue)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {r.cpa !== null ? money2(r.cpa) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted">
                    {r.cpaTarget !== null ? money2(r.cpaTarget) : "—"}
                  </td>
                  {/* La columna que hace comparable una campaña de CPA $4 con una
                      de CPA $30. Sin ella, ordenar por "peores" no se puede
                      verificar mirando la tabla. */}
                  <td className="px-5 py-3 text-right tabular-nums">
                    {z == null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span
                        className={
                          z > 1.15 ? "text-critical" : z > 1 ? "text-warning" : "text-good"
                        }
                      >
                        {z >= 1 ? "+" : "−"}
                        {Math.abs(Math.round((z - 1) * 100))}%
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {r.status === "sin-objetivo" ? (
                      <span className="whitespace-nowrap text-xs text-muted">sin producto</span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 text-xs ${ESTADO_FILA[r.status].chip}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {ESTADO_FILA[r.status].texto}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-sm text-muted">
                  {filtro === "revisar"
                    ? "Ninguna campaña se está pasando de su objetivo en este período."
                    : "No hay campañas con datos en este período."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
