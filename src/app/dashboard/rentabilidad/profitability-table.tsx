"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Row = {
  id: string;
  month: string;
  productName: string;
  orders: number;
  cpa: number;
  revenueAccum: number;
  adSpendAccum: number;
  operatingExpenseAccum: number;
  adminExpenseAccum: number;
  profitAccum: number;
  merchandiseAccum: number | null;
  desiredProfitPerOrder: number | null;
  revenuePerOrder: number;
  operatingExpensePerOrder: number;
  marginWithoutAds: number;
  adSpendPerOrder: number;
};

type Totals = {
  orders: number;
  revenueAccum: number;
  adSpendAccum: number;
  operatingExpenseAccum: number;
  adminExpenseAccum: number;
  profitAccum: number;
  cpa: number;
};

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const money2 = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export default function ProfitabilityTable({
  initialData,
  activeMonth,
  canEdit,
}: {
  initialData: { rows: Row[]; totals: Totals; months: string[] };
  activeMonth: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [isPending, startTransition] = useTransition();
  const months = data.months.length > 0 ? data.months : [activeMonth];

  const sorted = useMemo(() => [...data.rows].sort((a, b) => b.profitAccum - a.profitAccum), [data.rows]);

  async function saveOptional(row: Row, field: "merchandiseAccum" | "desiredProfitPerOrder", value: string) {
    const num = value.trim() === "" ? null : Number(value);
    const res = await fetch("/api/profitability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month: row.month,
        productName: row.productName,
        orders: row.orders,
        cpa: row.cpa,
        revenueAccum: row.revenueAccum,
        adSpendAccum: row.adSpendAccum,
        operatingExpenseAccum: row.operatingExpenseAccum,
        adminExpenseAccum: row.adminExpenseAccum,
        profitAccum: row.profitAccum,
        merchandiseAccum: field === "merchandiseAccum" ? num : row.merchandiseAccum,
        desiredProfitPerOrder: field === "desiredProfitPerOrder" ? num : row.desiredProfitPerOrder,
      }),
    });
    if (res.ok) {
      const { row: updated } = await res.json();
      setData((d) => ({ ...d, rows: d.rows.map((r) => (r.id === row.id ? updated : r)) }));
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {months.length > 1 && (
        <div className="flex gap-1">
          {months.map((m) => (
            <a
              key={m}
              href={`/dashboard/rentabilidad?month=${m}`}
              className={`text-xs font-mono uppercase tracking-wide px-3 py-1.5 rounded ${
                m === activeMonth ? "bg-accent text-white" : "bg-surface-2 text-muted hover:text-foreground"
              }`}
            >
              {m}
            </a>
          ))}
        </div>
      )}

      <div className="bg-surface border border-border rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-cols w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-xs font-mono uppercase tracking-wide text-muted">
                <th className="px-4 py-3 sticky left-0 bg-surface">Producto</th>
                <th className="px-4 py-3 text-right">Pedidos</th>
                <th className="px-4 py-3 text-right">CPA</th>
                <th className="px-4 py-3 text-right">Ingresos acum.</th>
                <th className="px-4 py-3 text-right">Gastos pub. acum.</th>
                <th className="px-4 py-3 text-right">Gastos op. acum.</th>
                <th className="px-4 py-3 text-right">Gastos adm. acum.</th>
                <th className="px-4 py-3 text-right">Utilidad acum.</th>
                <th className="px-4 py-3 text-right">Mercadería acum.</th>
                <th className="px-4 py-3 text-right">Ingreso x pedido</th>
                <th className="px-4 py-3 text-right">Gasto operativo</th>
                <th className="px-4 py-3 text-right">Margen sin pub.</th>
                <th className="px-4 py-3 text-right">Meta ganancia x pedido</th>
                <th className="px-4 py-3 text-right">Publicidad x pedido</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-surface-2/50">
                    <td className="px-4 py-2.5 font-medium sticky left-0 bg-surface">{r.productName}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.orders}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money2(r.cpa)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(r.revenueAccum)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(r.adSpendAccum)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(r.operatingExpenseAccum)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(r.adminExpenseAccum)}</td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums font-semibold ${
                        r.profitAccum >= 0 ? "text-good" : "text-critical"
                      }`}
                    >
                      {money(r.profitAccum)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {canEdit ? (
                        <input
                          type="number"
                          placeholder="—"
                          defaultValue={r.merchandiseAccum ?? ""}
                          onBlur={(e) => saveOptional(r, "merchandiseAccum", e.target.value)}
                          className="w-20 bg-transparent border border-border rounded px-1.5 py-0.5 text-right outline-none focus:border-accent"
                        />
                      ) : (
                        r.merchandiseAccum != null ? money(r.merchandiseAccum) : "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">{money2(r.revenuePerOrder)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">{money2(r.operatingExpensePerOrder)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">{money2(r.marginWithoutAds)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {canEdit ? (
                        <input
                          type="number"
                          placeholder="—"
                          defaultValue={r.desiredProfitPerOrder ?? ""}
                          onBlur={(e) => saveOptional(r, "desiredProfitPerOrder", e.target.value)}
                          className="w-20 bg-transparent border border-border rounded px-1.5 py-0.5 text-right outline-none focus:border-accent"
                        />
                      ) : (
                        r.desiredProfitPerOrder != null ? money(r.desiredProfitPerOrder) : "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">{money2(r.adSpendPerOrder)}</td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-4 py-8 text-center text-muted">
                    Sin datos de rentabilidad cargados para {activeMonth} todavía.
                  </td>
                </tr>
              )}
            </tbody>
            {sorted.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border font-semibold bg-surface-2/60">
                  <td className="px-4 py-3 sticky left-0 bg-surface-2/60">TOTAL</td>
                  <td className="px-4 py-3 text-right tabular-nums">{data.totals.orders}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money2(data.totals.cpa)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(data.totals.revenueAccum)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(data.totals.adSpendAccum)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(data.totals.operatingExpenseAccum)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(data.totals.adminExpenseAccum)}</td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${
                      data.totals.profitAccum >= 0 ? "text-good" : "text-critical"
                    }`}
                  >
                    {money(data.totals.profitAccum)}
                  </td>
                  <td colSpan={6} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="text-xs text-muted">
        Ingreso x pedido, Gasto operativo, Margen sin publicidad y Publicidad se calculan automáticamente a partir de
        los acumulados (÷ pedidos) — no hace falta cargarlos a mano. Mercadería acumulada y la meta de ganancia por
        pedido {canEdit ? "se pueden cargar aquí directamente." : "las carga un Director u Administrador."}
      </p>
      {isPending && <p className="text-xs text-muted">Actualizando…</p>}
    </div>
  );
}
