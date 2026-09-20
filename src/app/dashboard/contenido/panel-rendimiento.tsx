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
  piezasDelPeriodo: number;
  pendientes: number;
  sinClasificar: number;
  tareas: number;
  tareasHechas: number;
  tareasIncumplidas: number;
  creativos: number;
  productosACargo: string[];
};

const DIAS = [7, 30, 90] as const;

const money = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("es-EC", { style: "currency", currency: "USD" });

/** Quién hizo qué, y cómo le fue. Es el objetivo de la nomenclatura por lote:
 * trazabilidad de cada campaña y rendimiento de cada integrante. */
export default function PanelRendimiento() {
  const [dias, setDias] = useState<(typeof DIAS)[number]>(30);
  const [equipo, setEquipo] = useState<Persona[] | null>(null);
  // Los nombres escritos a mano en el día a día que no son de ningún usuario:
  // ese trabajo no se le cuenta a nadie hasta que alguien diga de quién es.
  const [sinEnlazar, setSinEnlazar] = useState<{ nombre: string; tareas: number }[]>([]);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/contenido/rendimiento?dias=${dias}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelado) return;
        setEquipo(d?.equipo ?? []);
        setSinEnlazar(d?.sinEnlazar ?? []);
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
      <div className="flex flex-wrap items-center gap-1.5">
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
        {/* La misma tabla, en papel: se usa en la reunión de quincena y en la
            evaluación de cada persona, donde no hay pantalla que mostrar. */}
        <a
          href={`/api/contenido/rendimiento/pdf?dias=${dias}`}
          className="ml-auto rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted transition hover:border-border-strong hover:text-foreground"
        >
          Descargar PDF
        </a>
      </div>

      {sinEnlazar.length > 0 && (
        <div className="rounded border border-warning bg-pending-bg px-3 py-2 text-xs text-warning">
          <span className="font-medium">
            Hay tareas a nombre de alguien que no es un usuario:{" "}
            {sinEnlazar.map((s) => `${s.nombre} (${s.tareas})`).join(", ")}.
          </span>{" "}
          <span className="text-muted">
            Ese trabajo no se le suma a nadie. Si es el apodo de alguien del equipo, anótalo en Usuarios › editar ›
            «Cómo aparece en el tablero» y pasa a contarle.
          </span>
        </div>
      )}

      {equipo == null ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : equipo.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">Todavía no hay tareas, piezas ni lotes en este período.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2">Integrante</th>
                  <th className="px-3 py-2 text-right" title="Tareas del tablero día a día en el período">Día a día</th>
                  <th className="px-3 py-2 text-right" title="Tareas del día a día cerradas como hechas">Cerradas</th>
                  <th className="px-3 py-2 text-right" title="Creativos comprometidos en esas tareas">Creativos</th>
                  <th className="px-3 py-2 text-right" title="Piezas de Requerimientos asignadas en el período">Piezas</th>
                  <th className="px-3 py-2 text-right" title="Pendientes, en edición o para revisar">Abiertas</th>
                  <th className="px-3 py-2 text-right" title="Les falta formato, ángulo, awareness u otro campo">Sin clasificar</th>
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
                    <td className="px-3 py-2">
                      <span className="block font-medium">{p.nombre}</span>
                      {p.productosACargo.length > 0 && (
                        <span className="block max-w-[260px] truncate text-[10px] text-muted" title={p.productosACargo.join(", ")}>
                          {p.productosACargo.join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.tareas}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {p.tareasHechas}
                      {p.tareas > 0 && (
                        <span className="text-[10px] text-muted"> · {Math.round((p.tareasHechas / p.tareas) * 100)}%</span>
                      )}
                      {p.tareasIncumplidas > 0 && (
                        <span className="block text-[10px] text-critical">{p.tareasIncumplidas} sin cumplir</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{p.creativos}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.piezasDelPeriodo}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${p.pendientes > 0 ? "text-warning" : "text-muted"}`}>{p.pendientes}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${p.sinClasificar > 0 ? "font-medium text-critical" : "text-muted"}`}>{p.sinClasificar}</td>
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
