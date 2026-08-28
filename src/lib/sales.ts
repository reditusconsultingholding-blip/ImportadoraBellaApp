import { db } from "@/lib/db";
import type { Range } from "@/lib/date-range";

// Vista de ventas de la tienda completa (Shopify), separada del rendimiento
// por campaña de Meta/TikTok — aquí entran todos los productos del catálogo,
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
  /** Lecturas en palabras de estas ventas. Se calculan, no las opina el modelo. */
  lecturas: string[];
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
    lecturas: [],
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
    lecturas: leerVentas({
      ordenes: todayOrders.length,
      ordenesAnterior: yesterdayOrders.length,
      netSales,
      netSalesAnterior: netSalesYesterday,
      canales: Array.from(channelTotals.entries()),
      porHora: seriesFor("netSales"),
      topProducto: topProducts[0] ?? null,
      descuentos: discounts,
    }),
  };
}

/**
 * Tres o cuatro observaciones sobre las ventas del período, en palabras.
 *
 * Se calculan aquí y no se le piden al modelo: son cuentas simples, tienen que
 * salir al instante y dar siempre lo mismo. El análisis con criterio — el que
 * cruza pauta con ventas y sugiere qué hacer — vive en el Pulso.
 */
function leerVentas(d: {
  ordenes: number;
  ordenesAnterior: number;
  netSales: number;
  netSalesAnterior: number;
  canales: [string, { today: number; yesterday: number }][];
  porHora: SalesPoint[];
  topProducto: { name: string; value: number } | null;
  descuentos: number;
}): string[] {
  const plata = (n: number) =>
    n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  if (d.ordenes === 0) return ["Todavía no hay ventas en este período."];
  const out: string[] = [];

  const ticket = d.netSales / d.ordenes;
  const ticketAnterior = d.ordenesAnterior > 0 ? d.netSalesAnterior / d.ordenesAnterior : null;
  if (ticketAnterior != null && ticketAnterior > 0) {
    const dif = ((ticket - ticketAnterior) / ticketAnterior) * 100;
    if (Math.abs(dif) >= 5) {
      out.push(
        dif > 0
          ? `El ticket promedio subió ${Math.round(dif)}%: ${plata(ticket)} contra ${plata(ticketAnterior)} del período anterior. Están comprando más por pedido.`
          : `El ticket promedio bajó ${Math.round(Math.abs(dif))}%: ${plata(ticket)} contra ${plata(ticketAnterior)}. Vale mirar si cambió el mix de productos o si se está descontando de más.`
      );
    }
  }

  // Concentración por canal: si uno se lleva casi todo, es un riesgo que
  // conviene ver escrito.
  const total = d.canales.reduce((s, [, v]) => s + v.today, 0);
  const ordenados = [...d.canales].sort((a, b) => b[1].today - a[1].today);
  if (total > 0 && ordenados.length > 0) {
    const [nombre, valor] = ordenados[0];
    const parte = Math.round((valor.today / total) * 100);
    out.push(
      parte >= 70 && ordenados.length > 1
        ? `${nombre} concentra el ${parte}% de lo facturado (${plata(valor.today)}). Si ese canal se cae, se cae casi toda la venta del día.`
        : `${nombre} es el canal que más factura: ${plata(valor.today)}, el ${parte}% del total.`
    );
  }

  // Franja horaria más fuerte: sirve para decidir cuándo empujar presupuesto.
  const pico = [...d.porHora].sort((a, b) => b.today - a.today)[0];
  if (pico && pico.today > 0 && d.netSales > 0) {
    const parte = Math.round((pico.today / d.netSales) * 100);
    if (parte >= 15) {
      out.push(
        `La franja de las ${pico.hour} concentra el ${parte}% de la venta (${plata(pico.today)}). Es la hora donde más rinde empujar presupuesto.`
      );
    }
  }

  if (d.descuentos > 0 && d.netSales > 0) {
    const parte = (d.descuentos / (d.netSales + d.descuentos)) * 100;
    if (parte >= 8) {
      out.push(
        `Se otorgaron ${plata(d.descuentos)} en descuentos, el ${Math.round(parte)}% de lo facturado. Conviene revisar si hace falta tanto para vender.`
      );
    }
  }

  if (d.topProducto && d.netSales > 0) {
    const parte = Math.round((d.topProducto.value / d.netSales) * 100);
    if (parte >= 20) {
      out.push(
        `${d.topProducto.name} solo se lleva el ${parte}% de la facturación. Es el producto del que más depende el día.`
      );
    }
  }

  return out.slice(0, 4);
}

