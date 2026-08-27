"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import PulseLine, { type PulseTone } from "../pulse-line";

export type DirectoryRow = {
  id: string;
  code: string;
  name: string;
  folder: string | null;
  salePrice: number | null;
  unitCost: number | null;
  margen: number | null;
  cpaTarget: number;
  cpaTargetProvisional: boolean;
  spend: number;
  purchases: number;
  cpa: number | null;
  score: number;
  state: PulseTone;
  serie: number[];
  campanas: number;
  creativos: number;
  creativosEnProduccion: number;
  creativosListosHoy: number;
  creativosVencidos: number;
};

const ESTADO: Record<PulseTone, { texto: string; chip: string }> = {
  SANO: { texto: "Sano", chip: "bg-good-bg text-good border-good/30" },
  VIGILAR: { texto: "Vigilar", chip: "bg-surface-2 text-warning border-warning/30" },
  RIESGO: { texto: "En riesgo", chip: "bg-critical-bg text-critical border-critical/30" },
  SIN_DATOS: { texto: "Sin pauta", chip: "bg-surface-2 text-muted border-border" },
};

type Orden = "pulso" | "gasto" | "nombre" | "creativos" | "margen";

const ORDENES: { id: Orden; label: string }[] = [
  { id: "pulso", label: "Pulso" },
  { id: "gasto", label: "Gasto" },
  { id: "margen", label: "Margen" },
  { id: "creativos", label: "Creativos" },
  { id: "nombre", label: "Nombre" },
];

const money = (n: number | null, dec = 2) =>
  n == null
    ? "—"
    : n.toLocaleString("es-EC", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: dec,
      });

const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Directorio de productos.
 *
 * Todo se filtra y ordena en el navegador a propósito: son decenas de filas,
 * no miles, y hacer un viaje al servidor por cada tecla del buscador se
 * sentiría lento sin ninguna ganancia.
 */
export default function ProductDirectory({
  rows,
  carpetas,
  totales,
  puedeGestionar,
}: {
  rows: DirectoryRow[];
  carpetas: string[];
  totales: { productos: number; conPauta: number; sinCosto: number };
  puedeGestionar: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [carpeta, setCarpeta] = useState("");
  const [estado, setEstado] = useState<"" | PulseTone>("");
  const [orden, setOrden] = useState<Orden>("pulso");

  const visibles = useMemo(() => {
    const q = plano(busqueda.trim());
    const palabras = q ? q.split(/\s+/) : [];

    const filtradas = rows.filter((r) => {
      if (carpeta && r.folder !== carpeta) return false;
      if (estado && r.state !== estado) return false;
      if (palabras.length === 0) return true;
      // Se busca por nombre y por código: los media buyers piensan en "134142".
      const heno = plano(`${r.name} ${r.code}`);
      return palabras.every((p) => heno.includes(p));
    });

    const orderBy: Record<Orden, (a: DirectoryRow, b: DirectoryRow) => number> = {
      // Por pulso: primero lo que está en riesgo Y mueve plata. Un producto
      // rojo que gastó cinco dólares no es el problema del día.
      pulso: (a, b) => {
        const rank: Record<PulseTone, number> = {
          RIESGO: 0,
          VIGILAR: 1,
          SANO: 2,
          SIN_DATOS: 3,
        };
        return rank[a.state] - rank[b.state] || b.spend - a.spend;
      },
      gasto: (a, b) => b.spend - a.spend,
      margen: (a, b) => (b.margen ?? -Infinity) - (a.margen ?? -Infinity),
      creativos: (a, b) => b.creativos - a.creativos,
      nombre: (a, b) => a.name.localeCompare(b.name, "es"),
    };

    return [...filtradas].sort(orderBy[orden]);
  }, [rows, busqueda, carpeta, estado, orden]);

  const gastoVisible = visibles.reduce((a, r) => a + r.spend, 0);
  const enRiesgo = visibles.filter((r) => r.state === "RIESGO").length;

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros: una sola fila arriba de la tabla. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o código…"
            className="flex-1 rounded border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {carpetas.length > 0 && (
            <select
              value={carpeta}
              onChange={(e) => setCarpeta(e.target.value)}
              className="rounded border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">Todas las carpetas</option>
              {carpetas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(["", "RIESGO", "VIGILAR", "SANO", "SIN_DATOS"] as const).map((e) => (
            <button
              key={e || "todos"}
              onClick={() => setEstado(e)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                estado === e
                  ? "border-accent bg-good-bg text-accent-strong"
                  : "border-border text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              {e === "" ? "Todos" : ESTADO[e].texto}
            </button>
          ))}

          <span className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
              Ordenar
            </span>
            {ORDENES.map((o) => (
              <button
                key={o.id}
                onClick={() => setOrden(o.id)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  orden === o.id
                    ? "border-accent bg-good-bg text-accent-strong"
                    : "border-border text-muted hover:border-border-strong hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </span>
        </div>

        <p className="text-xs text-muted">
          {visibles.length} de {totales.productos} productos · {money(gastoVisible, 0)} de pauta
          {enRiesgo > 0 && <span className="text-critical"> · {enRiesgo} en riesgo</span>}
          {totales.sinCosto > 0 && puedeGestionar && (
            <span> · {totales.sinCosto} sin costo por artículo cargado</span>
          )}
        </p>
      </div>

      {/* La tabla. Se desplaza sola en pantallas angostas. */}
      <div className="overflow-x-auto rounded border border-border bg-surface">
        <table className="w-full min-w-[52rem] text-sm table-cols">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.07em] text-muted">
              <th className="px-3 py-2 font-semibold">Producto</th>
              <th className="px-3 py-2 font-semibold">Pulso</th>
              <th className="px-3 py-2 text-right font-semibold">Gasto</th>
              <th className="px-3 py-2 text-right font-semibold">CPA / objetivo</th>
              <th className="px-3 py-2 text-right font-semibold">Precio / costo</th>
              <th className="px-3 py-2 text-right font-semibold">Margen</th>
              <th className="px-3 py-2 text-right font-semibold">Creativos</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted">
                  Ningún producto coincide con eso.
                </td>
              </tr>
            )}

            {visibles.map((r) => {
              const excedido = r.cpa != null && r.cpaTarget > 0 && r.cpa > r.cpaTarget;
              return (
                <tr key={r.id} className="border-b border-border last:border-b-0 hover:bg-surface-2">
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/dashboard/productos/${encodeURIComponent(r.code)}`}
                      className="block hover:underline"
                    >
                      <span className="block font-medium">{r.name}</span>
                      <span className="block text-xs text-muted">
                        {r.code}
                        {r.folder ? ` · ${r.folder}` : ""}
                        {r.campanas > 0
                          ? ` · ${r.campanas} ${r.campanas === 1 ? "campaña" : "campañas"}`
                          : " · sin campañas"}
                      </span>
                    </Link>
                  </td>

                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <PulseLine serie={r.serie} state={r.state} width={48} height={18} />
                      <span
                        className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${ESTADO[r.state].chip}`}
                      >
                        {ESTADO[r.state].texto}
                      </span>
                      {r.state !== "SIN_DATOS" && (
                        <span className="font-mono text-xs tabular-nums text-muted">{r.score}</span>
                      )}
                    </span>
                  </td>

                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {r.spend > 0 ? money(r.spend, 0) : "—"}
                    {r.purchases > 0 && (
                      <span className="block text-xs text-muted">{r.purchases} compras</span>
                    )}
                  </td>

                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className={excedido ? "text-critical" : undefined}>
                      {r.cpa == null ? "—" : money(r.cpa)}
                    </span>
                    <span className="block text-xs text-muted">
                      obj {money(r.cpaTarget)}
                      {r.cpaTargetProvisional && (
                        <span
                          className="text-warning"
                          title="El objetivo se puso sin conocer el costo real del producto: revisalo"
                        >
                          {" · provisional"}
                        </span>
                      )}
                    </span>
                  </td>

                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {money(r.salePrice)}
                    <span className="block text-xs text-muted">costo {money(r.unitCost)}</span>
                  </td>

                  <td className="px-3 py-2.5 text-right tabular-nums">{money(r.margen)}</td>

                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {r.creativos === 0 ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <>
                        {r.creativos}
                        <span className="block text-xs text-muted">
                          {r.creativosEnProduccion > 0 && `${r.creativosEnProduccion} en curso`}
                          {r.creativosListosHoy > 0 && (
                            <span className="text-good">
                              {r.creativosEnProduccion > 0 ? " · " : ""}
                              {r.creativosListosHoy} hoy
                            </span>
                          )}
                          {r.creativosVencidos > 0 && (
                            <span className="text-critical"> · {r.creativosVencidos} vencidos</span>
                          )}
                        </span>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
