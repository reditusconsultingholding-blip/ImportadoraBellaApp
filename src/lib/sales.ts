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

function buildSeries(peakToday: number, peakYesterday: number, seedOffset: number): SalesPoint[] {
  return Array.from({ length: 12 }, (_, i) => {
    const h = i * 2;
    const wave = (base: number, phase: number) =>
      Math.max(0, base * (0.35 + 0.65 * Math.sin((i + phase) / 2.1) ** 2));
    return {
      hour: hourLabel(h),
      today: Math.round(wave(peakToday, seedOffset)),
      yesterday: Math.round(wave(peakYesterday, seedOffset + 1.3)),
    };
  });
}

export type SalesOverview = {
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

export type HeaderStat = {
  label: string;
  value: number;
  changePct: number | null;
  format: "compact" | "count" | "percent";
  isMoney?: boolean;
};

function pctChange(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function demoSalesOverview(): SalesOverview {
  const grossSales = 4325.04;
  const discounts = -322.83;
  const netSales = grossSales + discounts;

  return {
    totalSales: netSales,
    totalSalesChangePct: 14,
    salesSeries: buildSeries(430, 340, 0),
    breakdown: [
      { label: "Ventas brutas", value: grossSales, changePct: 13 },
      { label: "Descuentos", value: discounts, changePct: -2 },
      { label: "Reversiones de ventas", value: 0, changePct: null },
      { label: "Ventas netas", value: netSales, changePct: 14 },
      { label: "Cargos de envío", value: 0, changePct: null },
      { label: "Cargos por devolución", value: 0, changePct: null },
      { label: "Impuestos", value: 0, changePct: null },
      { label: "Ventas totales", value: netSales, changePct: 14 },
    ],
    channels: [
      { label: "Funnelish", value: 2905.6, changePct: 14 },
      { label: "Releasit COD Form", value: 1096.61, changePct: 14 },
    ],
    aov: 35.41,
    aovChangePct: 1,
    aovSeries: buildSeries(70, 66, 2),
    topProducts: [
      { name: "Té para el cuidado del hígado", category: "Salud", value: 931, changePct: 22, share: 0.64 },
      { name: "Truly Post Afeitado", category: "Belleza", value: 909, changePct: 22, share: 0.54 },
      { name: "Dr. Althea · 345 Relief Cream", category: "Belleza", value: 659, changePct: 20, share: 0.73 },
      { name: "Té Ginseng para los Riñones", category: "Salud", value: 512, changePct: 18, share: 0.47 },
    ],
  };
}

function demoHeaderStats(): HeaderStat[] {
  return [
    { label: "Sesiones", value: 140200, changePct: 523, format: "compact" },
    { label: "Ventas totales", value: 298000, changePct: 68, format: "compact", isMoney: true },
    { label: "Pedidos", value: 8229, changePct: 62, format: "count" },
    { label: "Tasa de conversión", value: 0, changePct: null, format: "percent" },
  ];
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
  if (!store) return demoSalesOverview();

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

export async function getHeaderStats(organizationId: string): Promise<HeaderStat[]> {
  const store = await getConnectedStore(organizationId);
  if (!store) return demoHeaderStats();

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - 30);
  const prevWindowStart = new Date(now);
  prevWindowStart.setDate(prevWindowStart.getDate() - 60);

  const [current, previous] = await Promise.all([
    db.shopifyOrder.findMany({ where: { storeId: store.id, occurredAt: { gte: windowStart } } }),
    db.shopifyOrder.findMany({
      where: { storeId: store.id, occurredAt: { gte: prevWindowStart, lt: windowStart } },
    }),
  ]);

  const currentSales = current.reduce((s, o) => s + o.netSales, 0);
  const previousSales = previous.reduce((s, o) => s + o.netSales, 0);

  return [
    // Shopify no expone sesiones/conversión reales por la Admin API estándar
    // (hace falta ShopifyQL Analytics, con permisos aparte) — quedan en 0
    // en vez de inventar un número.
    { label: "Sesiones", value: 0, changePct: null, format: "compact" },
    {
      label: "Ventas totales",
      value: currentSales,
      changePct: pctChange(currentSales, previousSales),
      format: "compact",
      isMoney: true,
    },
    {
      label: "Pedidos",
      value: current.length,
      changePct: pctChange(current.length, previous.length),
      format: "count",
    },
    { label: "Tasa de conversión", value: 0, changePct: null, format: "percent" },
  ];
}
