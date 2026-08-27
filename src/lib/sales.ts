import { db } from "@/lib/db";
import type { Range } from "@/lib/date-range";

// Vista de ventas de la tienda completa (Shopify), separada del rendimiento
// por campaña de Meta/TikTok — acá entran todos los productos del catálogo,
// se anuncien o no. Si hay una tienda conectada (ver Conexiones), se calcula
// todo esto a partir de las órdenes reales; si no, quedan los datos de
// ejemplo para poder mostrar el panel mientras tanto.

function hourLabel(h: number) {
  if (h === 0) return "12 a. m.";
  if (h < 12) return `${h} a. m.`;
  if (h === 12) return "12 p. m.";
  return `${h - 12} p. m.`;
}

export type SalesPoint = { hour: string; today: number; yesterday: number };

export type SalesOverview = {
  /** Si hay una tienda conectada. En falso, todo lo demas viene en cero. */
  connected: boolean;
  totalSales: number;
  totalSalesChangePct: number;
  salesSeries: SalesPoint[];
  breakdown: { label: string; value: number; changePct: number | null }[];
  channels: { label: string; value: number; changePct: number }[];
  aov: number;
  aovChangePct: number;
  aovSeries: SalesPoint[];
  topProducts: { name: string; category: string; value: number; changePct: number; share: number }[];
};

function pctChange(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function sinTienda(): SalesOverview {
  // Ceros, no numeros de ejemplo. Un panel que muestra 4.325 dolares de
  // ventas inventadas es peor que uno vacio: el vacio se entiende, el numero
  // falso se cree.
  const vacia = Array.from({ length: 12 }, (_, i) => ({
    hour: hourLabel(i * 2),
    today: 0,
    yesterday: 0,
  }));
  return {
    connected: false,
    totalSales: 0,
    totalSalesChangePct: 0,
    salesSeries: vacia,
    breakdown: [],
    channels: [],
    aov: 0,
    aovChangePct: 0,
    aovSeries: vacia,
    topProducts: [],
  };
}

async function getConnectedStore(organizationId: string) {
  return db.shopifyStore.findFirst({
    where: { organizationId, connectedAt: { not: null } },
  });
}

/**
 * Ventas del período elegido, contra el período anterior del mismo largo.
 *
 * Antes esto ignoraba el selector de fechas y calculaba siempre "hoy" — y ese
 * "hoy" salía de setHours() sobre la hora del servidor, que en Railway es UTC.
 * O sea que el día arrancaba a las 19:00 de la víspera en Ecuador, y las barras
 * por hora mostraban horas que no eran las de nadie.
 */
export async function getSalesOverview(
  organizationId: string,
  range: Range
): Promise<SalesOverview> {
  const store = await getConnectedStore(organizationId);
  if (!store) return sinTienda();

  const todayStart = range.fromInstant;
  const finPeriodo = range.toInstant;
  // El período de comparación es igual de largo y termina justo antes de que
  // arranque este: comparar una semana contra un día haría que todo pareciera
  // un derrumbe.
  const largo = finPeriodo.getTime() - todayStart.getTime();
  const yesterdayStart = new Date(todayStart.getTime() - largo - 1);

  const orders = await db.shopifyOrder.findMany({
    where: { storeId: store.id, occurredAt: { gte: yesterdayStart, lte: finPeriodo } },
    include: { lineItems: true },
  });

  const todayOrders = orders.filter((o) => o.occurredAt >= todayStart);
  const yesterdayOrders = orders.filter((o) => o.occurredAt < todayStart);

  const sum = (list: typeof orders, key: "grossSales" | "discounts" | "shipping" | "taxes" | "netSales") =>
    list.reduce((s, o) => s + o[key], 0);

  const grossSales = sum(todayOrders, "grossSales");
  const discounts = sum(todayOrders, "discounts");
  const shipping = sum(todayOrders, "shipping");
  const taxes = sum(todayOrders, "taxes");
  const netSales = sum(todayOrders, "netSales");
  const netSalesYesterday = sum(yesterdayOrders, "netSales");

  // La hora que le interesa a Fabrizio es la de Ecuador, no la del servidor.
  // getHours() en Railway devuelve UTC, así que un pico de las 3 de la tarde
  // aparecía a las 8 de la noche.
  const horaEcuador = (d: Date) => (d.getUTCHours() + 24 - 5) % 24;

  const seriesFor = (key: "netSales") =>
    Array.from({ length: 12 }, (_, i) => {
      const h = i * 2;
      const enFranja = (o: (typeof orders)[number]) =>
        horaEcuador(o.occurredAt) >= h && horaEcuador(o.occurredAt) < h + 2;
      return {
        hour: hourLabel(h),
        today: Math.round(todayOrders.filter(enFranja).reduce((s, o) => s + o[key], 0)),
        yesterday: Math.round(yesterdayOrders.filter(enFranja).reduce((s, o) => s + o[key], 0)),
      };
    });

  const channelTotals = new Map<string, { today: number; yesterday: number }>();
  for (const o of todayOrders) {
    const entry = channelTotals.get(o.channel) ?? { today: 0, yesterday: 0 };
    entry.today += o.netSales;
    channelTotals.set(o.channel, entry);
  }
  for (const o of yesterdayOrders) {
    const entry = channelTotals.get(o.channel) ?? { today: 0, yesterday: 0 };
    entry.yesterday += o.netSales;
    channelTotals.set(o.channel, entry);
  }

  const productTotals = new Map<string, { value: number; category: string }>();
  for (const o of todayOrders) {
    for (const li of o.lineItems) {
      const entry = productTotals.get(li.productName) ?? { value: 0, category: li.category ?? "" };
      entry.value += li.amount;
      productTotals.set(li.productName, entry);
    }
  }
  const topProducts = Array.from(productTotals.entries())
    .map(([name, v]) => ({ name, category: v.category, value: v.value, changePct: 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const topValue = topProducts[0]?.value || 1;

  return {
    connected: true,
    totalSales: netSales,
    totalSalesChangePct: pctChange(netSales, netSalesYesterday),
    salesSeries: seriesFor("netSales"),
    breakdown: [
      { label: "Ventas brutas", value: grossSales, changePct: null },
      { label: "Descuentos", value: -discounts, changePct: null },
      { label: "Reversiones de ventas", value: 0, changePct: null },
      { label: "Ventas netas", value: grossSales - discounts, changePct: null },
      { label: "Cargos de envío", value: shipping, changePct: null },
      { label: "Cargos por devolución", value: 0, changePct: null },
      { label: "Impuestos", value: taxes, changePct: null },
      { label: "Ventas totales", value: netSales, changePct: pctChange(netSales, netSalesYesterday) },
    ],
    channels: Array.from(channelTotals.entries()).map(([label, v]) => ({
      label,
      value: v.today,
      changePct: pctChange(v.today, v.yesterday),
    })),
    aov: todayOrders.length > 0 ? netSales / todayOrders.length : 0,
    aovChangePct: pctChange(
      todayOrders.length > 0 ? netSales / todayOrders.length : 0,
      yesterdayOrders.length > 0 ? netSalesYesterday / yesterdayOrders.length : 0
    ),
    aovSeries: seriesFor("netSales"),
    topProducts: topProducts.map((p) => ({ ...p, share: p.value / topValue })),
  };
}

