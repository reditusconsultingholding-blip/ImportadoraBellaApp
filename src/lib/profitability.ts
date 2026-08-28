import { db } from "@/lib/db";

// Mismo cálculo que la API (src/app/api/profitability/route.ts) — vive aquí
// para que el server component de la página y la API compartan la misma
// fórmula y no se desincronicen.
export function withDerived<T extends {
  orders: number;
  revenueAccum: number;
  adSpendAccum: number;
  operatingExpenseAccum: number;
  adminExpenseAccum: number;
}>(row: T) {
  const orders = row.orders || 0;
  const revenuePerOrder = orders ? row.revenueAccum / orders : 0;
  const operatingExpensePerOrder = orders ? row.operatingExpenseAccum / orders : 0;
  const adSpendPerOrder = orders ? row.adSpendAccum / orders : 0;
  const marginWithoutAds = orders
    ? (row.revenueAccum - row.operatingExpenseAccum - row.adminExpenseAccum) / orders
    : 0;
  return { ...row, revenuePerOrder, operatingExpensePerOrder, marginWithoutAds, adSpendPerOrder };
}

export async function getProfitability(organizationId: string, month?: string) {
  const rows = await db.productProfitability.findMany({
    where: { organizationId, ...(month ? { month } : {}) },
    orderBy: [{ month: "desc" }, { profitAccum: "desc" }],
  });

  const enriched = rows.map(withDerived);

  const totals = rows.reduce(
    (acc, r) => ({
      orders: acc.orders + r.orders,
      revenueAccum: acc.revenueAccum + r.revenueAccum,
      adSpendAccum: acc.adSpendAccum + r.adSpendAccum,
      operatingExpenseAccum: acc.operatingExpenseAccum + r.operatingExpenseAccum,
      adminExpenseAccum: acc.adminExpenseAccum + r.adminExpenseAccum,
      profitAccum: acc.profitAccum + r.profitAccum,
    }),
    { orders: 0, revenueAccum: 0, adSpendAccum: 0, operatingExpenseAccum: 0, adminExpenseAccum: 0, profitAccum: 0 }
  );
  const cpa = totals.orders ? totals.adSpendAccum / totals.orders : 0;

  const monthRows = await db.productProfitability.findMany({
    where: { organizationId },
    select: { month: true },
    distinct: ["month"],
  });
  const months = Array.from(new Set(monthRows.map((m) => m.month)));

  return { rows: enriched, totals: { ...totals, cpa }, months };
}

export type ProfitabilityRow = Awaited<ReturnType<typeof getProfitability>>["rows"][number];
