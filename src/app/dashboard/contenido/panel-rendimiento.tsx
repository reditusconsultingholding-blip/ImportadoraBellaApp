"use client";

import { useEffect, useState } from "react";

type Persona = {
  userId: string;
  nombre: string;
  lotes: number;
  piezasEntregadas: number;
  winners: number;
  campanas: number;
  gastoTotal: number | null;
  compras: number;
  cpaPromedio: number | null;
  mejorProducto: string | null;
  peorProducto: string | null;
};

const DIAS = [7, 30, 90] as const;

const money = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("es-EC", { style: "currency", currency: "USD" });

/** Quién hizo qué, y cómo le fue. Es el objetivo de la nomenclatura por lote:
 * trazabilidad de cada campaña y rendimiento de cada integrante. */
export default function PanelRendimiento() {
  const [dias, setDias] = useState<(typeof DIAS)[number]>(30);
  const [equipo, setEquipo] = useState<Persona[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/contenido/rendimiento?dias=${dias}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelado) setEquipo(d?.equipo ?? []);
      })
      .catch(() => {
        if (!cancelado) setEquipo([]);
      });
    return () => {
      cancelado = true;
    };
  }, [dias]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5">
        {DIAS.map((d) => (
          <button
            key={d}
            onClick={() => setDias(d)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              dias === d
                ? "border-accent bg-good-bg text-accent-strong"
                : "border-border text-muted hover:border-border-strong hover:text-foreground"
            }`}
          >
            Últimos {d} días
          </button>
        ))}
      </div>

      {equipo == null ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : equipo.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">Todavía no hay lotes ni piezas entregadas en este período.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2">Integrante</th>
                  <th className="px-3 py-2">Lotes</th>
                  <th className="px-3 py-2">Piezas entregadas</th>
                  <th className="px-3 py-2">Winners</th>
                  <th className="px-3 py-2">Campañas</th>
                  <th className="px-3 py-2">Compras</th>
                  {equipo.some((p) => p.gastoTotal != null) && <th className="px-3 py-2">CPA promedio</th>}
                  <th className="px-3 py-2">Mejor producto</th>
                </tr>
              </thead>
              <tbody>
                {equipo.map((p) => (
                  <tr key={p.userId} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 font-medium">{p.nombre}</td>
                    <td className="px-3 py-2">{p.lotes}</td>
                    <td className="px-3 py-2">{p.piezasEntregadas}</td>
                    <td className="px-3 py-2">{p.winners}</td>
                    <td className="px-3 py-2">{p.campanas}</td>
                    <td className="px-3 py-2">{p.compras}</td>
                    {equipo.some((x) => x.gastoTotal != null) && (
                      <td className="px-3 py-2">{money(p.cpaPromedio)}</td>
                    )}
                    <td className="px-3 py-2 text-muted">{p.mejorProducto ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
