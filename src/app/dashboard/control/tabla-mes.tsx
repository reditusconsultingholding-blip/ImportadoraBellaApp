"use client";

import type { FilaResumen, Totales } from "@/lib/control-opciones";

// El acumulado del mes por producto: la pregunta de Emilia —"cuánta utilidad
// llevamos con cada producto"— en una sola pantalla, sin filtrar día por día.
//
// Ordenado por utilidad y no alfabético: arriba lo que da plata y abajo lo que
// la pierde, que es el orden en que se decide qué escalar y qué apagar.

const dinero = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const dinero2 = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

const CELDA = "px-2.5 py-2 whitespace-nowrap";
const NUM = `${CELDA} text-right tabular-nums`;

export default function TablaMes({
  resumen,
  anio,
  mes,
}: {
  resumen: { filas: FilaResumen[]; totales: Totales };
  anio: number;
  mes: number;
}) {
  const { filas, totales } = resumen;

  if (filas.length === 0) {
    return (
      <div className="rounded border border-border bg-surface p-6 text-sm text-muted">
        No hay cierres guardados para {mes}/{anio}.
      </div>
    );
  }

  // La barra se dibuja contra el producto que más aporta, no contra el total:
  // así se ve la distancia entre el primero y el resto, que es lo que dice si
  // el mes lo sostiene un producto solo.
  const tope = Math.max(...filas.map((f) => Math.abs(f.utilidad)), 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { t: "Pedidos", v: totales.pedidos.toLocaleString("es-EC") },
          { t: "Ingresos", v: dinero(totales.ingresos) },
          { t: "Gasto publicitario", v: dinero(totales.gasto) },
          { t: "Costos", v: dinero(totales.gastosOperativos + totales.gastosAdm) },
          { t: "Utilidad", v: dinero(totales.utilidad), fuerte: true, malo: totales.utilidad < 0 },
        ].map((c) => (
          <div key={c.t} className="rounded border border-border bg-surface px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.07em] text-muted">{c.t}</p>
            <p
              className={`mt-0.5 text-lg font-semibold tabular-nums ${
                c.fuerte ? (c.malo ? "text-critical" : "text-good") : ""
              }`}
            >
              {c.v}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded border border-border bg-surface">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.07em] text-muted">
              <th className={CELDA}>Producto</th>
              <th className={NUM}>Pedidos</th>
              <th className={NUM}>CPA</th>
              <th className={NUM}>Ingresos</th>
              <th className={NUM}>Publicidad</th>
              <th className={NUM}>Operativos</th>
              <th className={NUM}>Adm.</th>
              <th className={NUM}>Utilidad</th>
              <th className={NUM}>Margen</th>
              <th className={`${CELDA} w-32`} />
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.productId} className="border-b border-border last:border-b-0 hover:bg-surface-2/60">
                <td className={CELDA}>
                  <span className="block max-w-[240px] truncate">{f.producto}</span>
                  <span className="text-[10px] text-muted">{f.codigo}</span>
                </td>
                <td className={NUM}>{f.pedidos.toLocaleString("es-EC")}</td>
                <td className={NUM}>{f.pedidos > 0 ? dinero2(f.cpa) : "—"}</td>
                <td className={NUM}>{dinero(f.ingresos)}</td>
                <td className={NUM}>{dinero(f.gasto)}</td>
                <td className={`${NUM} text-muted`}>{dinero(f.gastosOperativos)}</td>
                <td className={`${NUM} text-muted`}>{dinero(f.gastosAdm)}</td>
                <td className={`${NUM} font-semibold ${f.utilidad >= 0 ? "text-good" : "text-critical"}`}>
                  {dinero(f.utilidad)}
                </td>
                <td className={`${NUM} ${f.margen >= 0 ? "" : "text-critical"}`}>{pct(f.margen)}</td>
                <td className={CELDA}>
                  <div className="h-1.5 w-28 rounded-full bg-surface-2">
                    <div
                      className={`h-1.5 rounded-full ${f.utilidad >= 0 ? "bg-accent" : "bg-critical"}`}
                      style={{ width: `${Math.min(100, (Math.abs(f.utilidad) / tope) * 100)}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
