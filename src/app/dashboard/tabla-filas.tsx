"use client";

import { useState } from "react";
import Link from "next/link";
import type { FilaVisible } from "@/lib/metrics";

// La tabla de producto y campaña, con filtro.
//
// Antes venía ordenada por gasto y punto. Con 2.700 campañas eso responde
// "¿dónde se está yendo la plata?" pero no "¿qué está mal?" — y lo segundo es
// lo que se mira todos los días.
//
// El orden que importa no es el gasto sino CUÁNTO SE ALEJA DEL OBJETIVO. Una
// campaña que gasta $2.000 a la mitad de su CPA objetivo no es un problema;
// una que gasta $200 al doble, sí.
//
// Las filas llegan ya recortadas del servidor (ver `filasVisibles`): sin el
// permiso de finanzas no traen gasto, ingreso, CPA ni objetivo, y por eso acá
// no hay ningún `if` tapando columnas que igual habrían viajado dentro del
// HTML. Lo que sí llega siempre es `desvio` —cuántas veces el objetivo se está
// pagando—, que es lo que sostiene los filtros sin nombrar un monto.

const ESTADO_FILA = {
  sano: { texto: "Va bien", chip: "bg-good-bg text-good" },
  vigilar: { texto: "Optimizar", chip: "bg-surface-2 text-warning" },
  riesgo: { texto: "Va mal", chip: "bg-critical-bg text-critical" },
  "sin-objetivo": { texto: "Sin producto", chip: "bg-surface-2 text-muted" },
} as const;

const money2 = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const entero = (n: number) => n.toLocaleString("es-EC");

type Filtro = "gasto" | "mejores" | "peores" | "revisar";

function filtrosPara(verCifras: boolean): { id: Filtro; label: string; ayuda: string }[] {
  return [
    {
      id: "gasto",
      label: verCifras ? "Más gasto" : "Las que más mueven",
      ayuda: verCifras
        ? "Dónde se está yendo la plata"
        : "Ordenadas por volumen de pauta, de mayor a menor",
    },
    { id: "mejores", label: "Las mejores", ayuda: "Las que más lejos están de su techo de costo" },
    { id: "peores", label: "Las peores", ayuda: "Las que más se pasan de su objetivo" },
    { id: "revisar", label: "Solo las que van mal", ayuda: "Las que piden una decisión hoy" },
  ];
}

function ordenar(filas: FilaVisible[], filtro: Filtro) {
  // El orden que llega del servidor ya es por gasto, y mostrarlo así no dice
  // cuánto gastó ninguna.
  if (filtro === "gasto") return filas;

  // Las que no tienen objetivo no se pueden juzgar: quedan al final en vez de
  // colarse arriba como si fueran las mejores.
  const conObjetivo = filas.filter((f) => f.desvio != null);
  const sinObjetivo = filas.filter((f) => f.desvio == null);

  if (filtro === "revisar") {
    return conObjetivo
      .filter((f) => f.status === "riesgo" || f.status === "vigilar")
      .sort((a, b) => b.desvio! - a.desvio!);
  }

  const ordenadas = [...conObjetivo].sort((a, b) =>
    filtro === "peores" ? b.desvio! - a.desvio! : a.desvio! - b.desvio!
  );
  return [...ordenadas, ...sinObjetivo];
}

export default function TablaFilas({
  filas,
  verCifras,
  puedeAbrirProducto,
}: {
  filas: FilaVisible[];
  /** Si esta persona ve dinero. Define qué columnas existen, no cuáles se tapan. */
  verCifras: boolean;
  puedeAbrirProducto: boolean;
}) {
  const [filtro, setFiltro] = useState<Filtro>("gasto");
  const FILTROS = filtrosPara(verCifras);
  const visibles = ordenar(filas, filtro);
  const ayuda = FILTROS.find((f) => f.id === filtro)?.ayuda;
  // Ocho columnas con plata, siete sin ella: hace falta para la fila vacía.
  const columnas = verCifras ? 8 : 7;

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
              {verCifras ? (
                <th className="px-5 py-3 text-right">Gasto</th>
              ) : (
                <>
                  <th className="px-5 py-3 text-right">Impresiones</th>
                  <th className="px-5 py-3 text-right">CTR</th>
                </>
              )}
              <th className="px-5 py-3 text-right">Compras</th>
              {verCifras && (
                <>
                  <th className="px-5 py-3 text-right">Ingreso</th>
                  <th className="px-5 py-3 text-right">CPA</th>
                  <th className="px-5 py-3 text-right">Objetivo</th>
                </>
              )}
              <th className="px-5 py-3 text-right">vs. objetivo</th>
              <th className="px-5 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => {
              const z = r.desvio;
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
                  {verCifras ? (
                    <td className="px-5 py-3 text-right tabular-nums">{money2(r.spend ?? 0)}</td>
                  ) : (
                    <>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {entero(r.impressions)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {r.ctr == null ? (
                          <span className="text-muted">—</span>
                        ) : (
                          `${r.ctr.toFixed(2)}%`
                        )}
                      </td>
                    </>
                  )}
                  <td className="px-5 py-3 text-right tabular-nums">{r.purchases}</td>
                  {verCifras && (
                    <>
                      <td className="px-5 py-3 text-right tabular-nums">{money2(r.revenue ?? 0)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {r.cpa != null ? money2(r.cpa) : "—"}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted">
                        {r.cpaTarget != null ? money2(r.cpaTarget) : "—"}
                      </td>
                    </>
                  )}
                  {/* La columna que hace comparable una campaña de CPA $4 con una
                      de CPA $30. Sin ella, ordenar por "peores" no se puede
                      verificar mirando la tabla — y para quien no ve los montos
                      es lo único que dice cuán lejos está del objetivo. */}
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
                <td colSpan={columnas} className="px-5 py-8 text-center text-sm text-muted">
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
