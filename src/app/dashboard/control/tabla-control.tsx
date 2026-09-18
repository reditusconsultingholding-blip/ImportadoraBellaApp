"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Control, FilaControl } from "@/lib/control-opciones";
import { ETIQUETA_HORA, HORAS_CORTE } from "@/lib/control-opciones";

// La tabla del día a día. Es la planilla, columna por columna, en el orden en
// que el equipo la lee: primero lo que pasó (pedidos, CPA, gasto), después lo
// que eso significa (efectivos, costos) y al final lo único que importa
// decidir, la utilidad.

type ProductoOpcion = { id: string; code: string; name: string };

const dinero = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const dinero2 = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

const CELDA = "px-2.5 py-1.5 whitespace-nowrap";
const NUM = `${CELDA} text-right tabular-nums`;

function diaCorto(iso: string) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return d.toLocaleDateString("es-EC", { day: "numeric", month: "short", timeZone: "UTC" });
}

export default function TablaControl({
  control,
  productos,
  desde,
  hasta,
  hora,
  producto,
}: {
  control: Control;
  productos: ProductoOpcion[];
  desde: string;
  hasta: string;
  hora: string;
  producto: string;
}) {
  const router = useRouter();
  const [tope, setTope] = useState(200);

  const ir = (cambios: Record<string, string>) => {
    const q = new URLSearchParams({ vista: "dia", desde, hasta, hora, producto, ...cambios });
    for (const [k, v] of [...q]) if (!v) q.delete(k);
    router.push(`/dashboard/control?${q.toString()}`);
  };

  const { filas, totales } = control;
  const visibles = useMemo(() => filas.slice(0, tope), [filas, tope]);

  const campo =
    "rounded border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground focus:border-border-strong focus:outline-none";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Desde
          <input type="date" value={desde} onChange={(e) => ir({ desde: e.target.value })} className={campo} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Hasta
          <input type="date" value={hasta} onChange={(e) => ir({ hasta: e.target.value })} className={campo} />
        </label>
        <select value={hora} onChange={(e) => ir({ hora: e.target.value })} className={campo} aria-label="Corte del día">
          {HORAS_CORTE.map((h) => (
            <option key={h} value={String(h)}>
              {ETIQUETA_HORA[h]}
            </option>
          ))}
          <option value="todas">Los cuatro cortes</option>
        </select>
        <select
          value={producto}
          onChange={(e) => ir({ producto: e.target.value })}
          className={campo}
          aria-label="Producto"
        >
          <option value="">Todos los productos</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </div>

      {control.mesesSinGastoAdm.length > 0 && (
        <p className="rounded border border-warning bg-surface px-3 py-2 text-xs text-warning">
          Sin gasto administrativo cargado para{" "}
          {control.mesesSinGastoAdm.map((m) => m.replace("-", "/")).join(", ")}. Esas filas cuentan
          $0 de administración, así que la utilidad sale más alta de lo real. Se carga en
          &laquo;Economía por producto&raquo;.
        </p>
      )}
      {control.sinEconomiaDelMes > 0 && (
        <p className="rounded border border-warning bg-surface px-3 py-2 text-xs text-warning">
          {control.sinEconomiaDelMes} de {filas.length} filas usan los números de la ficha del
          producto en vez de los del mes. La efectividad cambia mucho mes a mes, así que eso es una
          estimación, no el número del mes.
        </p>
      )}

      <Totales totales={totales} filas={filas.length} />

      {filas.length === 0 ? (
        <div className="rounded border border-border bg-surface p-6 text-sm text-muted">
          No hay cortes guardados en ese rango.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-border bg-surface">
          <table className="w-full min-w-[1180px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.07em] text-muted">
                <th className={CELDA}>Fecha</th>
                <th className={CELDA}>Producto</th>
                {hora === "todas" && <th className={CELDA}>Corte</th>}
                <th className={`${NUM}`}>Pedidos</th>
                <th className={`${NUM}`}>Reales</th>
                <th className={`${NUM}`}>Dif.</th>
                <th className={`${NUM}`}>CPA</th>
                <th className={`${NUM}`}>Gasto</th>
                <th className={`${NUM}`}>Efect.</th>
                <th className={`${NUM}`}>Efectivos</th>
                <th className={`${NUM}`}>Operativos</th>
                <th className={`${NUM}`}>Ingresos</th>
                <th className={`${NUM}`}>Adm.</th>
                <th className={`${NUM}`}>Utilidad</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <Fila key={`${f.fecha}-${f.hora}-${f.productId}`} f={f} mostrarCorte={hora === "todas"} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filas.length > tope && (
        <button
          type="button"
          onClick={() => setTope((t) => t + 200)}
          className="self-center rounded border border-border px-4 py-2 text-xs font-medium transition hover:bg-surface-2"
        >
          Ver 200 más · quedan {(filas.length - tope).toLocaleString("es-EC")}
        </button>
      )}
    </div>
  );
}

function Fila({ f, mostrarCorte }: { f: FilaControl; mostrarCorte: boolean }) {
  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-surface-2/60">
      <td className={`${CELDA} text-muted`}>{diaCorto(f.fecha)}</td>
      <td className={CELDA}>
        <span className="block max-w-[210px] truncate">{f.producto}</span>
        {!f.economiaDelMes && (
          <span className="text-[10px] text-warning" title="Calculado con los números de la ficha, no con los del mes">
            economía estimada
          </span>
        )}
      </td>
      {mostrarCorte && <td className={`${CELDA} text-muted`}>{f.hora}h</td>}
      <td className={NUM}>{f.pedidos}</td>
      <td className={`${NUM} text-muted`}>{f.pedidosReales}</td>
      <td className={`${NUM} ${f.diferencia === 0 ? "text-muted" : f.diferencia > 0 ? "text-good" : "text-critical"}`}>
        {f.diferencia > 0 ? `+${f.diferencia}` : f.diferencia}
      </td>
      <td className={NUM}>{f.pedidos > 0 ? dinero2(f.cpa) : "—"}</td>
      <td className={NUM}>{dinero(f.gasto)}</td>
      <td className={`${NUM} text-muted`}>{pct(f.efectividad)}</td>
      <td className={`${NUM} text-muted`}>{f.pedidosEfectivos.toFixed(1)}</td>
      <td className={`${NUM} text-muted`}>{dinero(f.gastosOperativos)}</td>
      <td className={NUM}>{dinero(f.ingresos)}</td>
      <td className={`${NUM} text-muted`}>{dinero(f.gastosAdm)}</td>
      <td className={`${NUM} font-semibold ${f.utilidad >= 0 ? "text-good" : "text-critical"}`}>
        {dinero(f.utilidad)}
      </td>
    </tr>
  );
}

function Totales({ totales, filas }: { totales: Control["totales"]; filas: number }) {
  const tarjetas = [
    { t: "Pedidos", v: totales.pedidos.toLocaleString("es-EC"), n: `${totales.pedidosReales.toLocaleString("es-EC")} reales en la tienda` },
    { t: "Gasto publicitario", v: dinero(totales.gasto), n: `CPA ${totales.pedidos > 0 ? dinero2(totales.cpa) : "—"}` },
    { t: "Ingresos", v: dinero(totales.ingresos), n: "precio promedio × pedidos efectivos" },
    { t: "Costos operativos", v: dinero(totales.gastosOperativos), n: "producción + flete" },
    { t: "Administrativos", v: dinero(totales.gastosAdm), n: "del total del mes, repartido" },
    {
      t: "Utilidad",
      v: dinero(totales.utilidad),
      n: `margen ${pct(totales.margen)}`,
      fuerte: true,
      malo: totales.utilidad < 0,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {tarjetas.map((c) => (
        <div key={c.t} className="rounded border border-border bg-surface px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-[0.07em] text-muted">{c.t}</p>
          <p
            className={`mt-0.5 text-lg font-semibold tabular-nums ${
              c.fuerte ? (c.malo ? "text-critical" : "text-good") : ""
            }`}
          >
            {c.v}
          </p>
          <p className="text-[10px] text-muted">{c.n}</p>
        </div>
      ))}
      <p className="sr-only">{filas} filas</p>
    </div>
  );
}
