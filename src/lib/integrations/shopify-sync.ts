import { db } from "@/lib/db";
import { fetchRecentOrders } from "./shopify";

// Cuántas órdenes se escriben por vuelta. Con 400 cada lote son ~5 consultas
// en vez de ~1.600, que es lo que costaba escribirlas de a una.
const LOTE = 400;

const trozos = <T,>(items: T[], tamano: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) out.push(items.slice(i, i + tamano));
  return out;
};

/**
 * Trae las órdenes de los últimos días y las guarda.
 *
 * Se llama al conectar, desde el cron (ver /api/cron/sync) y a mano con
 * ?dias=N para rellenar histórico.
 *
 * La escritura va por lotes y no orden por orden. La versión anterior hacía un
 * upsert, un deleteMany y un create por renglón para cada orden: contra el
 * pooler de Supabase eso son cuatro viajes por orden, y un backfill de un mes
 * (~15.000 órdenes acá) no llegaba a terminar dentro del request. Acá se
 * separan las nuevas de las que ya estaban: las nuevas entran con createMany
 * de una, y solo las que ya existían se actualizan de a una, porque sus
 * totales sí cambian (Shopify ajusta descuentos y envíos después).
 */
export async function syncShopifyStore(storeId: string, days?: number) {
  const store = await db.shopifyStore.findUniqueOrThrow({ where: { id: storeId } });

  // Sin `days` explícito: 30 días la primera vez, para que Ventas y
  // Rentabilidad muestren algo desde el minuto uno; después 2, porque el cron
  // corre cada 15 minutos y volver a pedir un mes entero cada vez sería tirar
  // cuota a la basura.
  const yaTieneOrdenes = await db.shopifyOrder.count({ where: { storeId: store.id } });
  const since = new Date();
  since.setDate(since.getDate() - (days ?? (yaTieneOrdenes > 0 ? 2 : 30)));

  const orders = await fetchRecentOrders(store.shopDomain, store.accessToken, since.toISOString());

  let creadas = 0;
  let actualizadas = 0;

  for (const lote of trozos(orders, LOTE)) {
    const ids = lote.map((o) => o.externalId);

    // Quiénes ya estaban ANTES de escribir este lote. Se pregunta primero
    // porque después del createMany ya no se distingue.
    const previas = await db.shopifyOrder.findMany({
      where: { storeId: store.id, externalId: { in: ids } },
      select: { externalId: true },
    });
    const yaEstaban = new Set(previas.map((p) => p.externalId));

    const nuevas = lote.filter((o) => !yaEstaban.has(o.externalId));
    if (nuevas.length > 0) {
      await db.shopifyOrder.createMany({
        data: nuevas.map((o) => ({
          storeId: store.id,
          externalId: o.externalId,
          occurredAt: new Date(o.occurredAt),
          channel: o.channel,
          grossSales: o.grossSales,
          discounts: o.discounts,
          shipping: o.shipping,
          taxes: o.taxes,
          netSales: o.netSales,
        })),
        skipDuplicates: true,
      });
      creadas += nuevas.length;
    }

    for (const o of lote) {
      if (!yaEstaban.has(o.externalId)) continue;
      await db.shopifyOrder.update({
        where: { storeId_externalId: { storeId: store.id, externalId: o.externalId } },
        data: {
          channel: o.channel,
          grossSales: o.grossSales,
          discounts: o.discounts,
          shipping: o.shipping,
          taxes: o.taxes,
          netSales: o.netSales,
        },
      });
      actualizadas += 1;
    }

    // Los renglones se reescriben enteros: es más simple que diferenciarlos y
    // el volumen por lote lo aguanta.
    const guardadas = await db.shopifyOrder.findMany({
      where: { storeId: store.id, externalId: { in: ids } },
      select: { id: true, externalId: true },
    });
    const idPorExterno = new Map(guardadas.map((g) => [g.externalId, g.id]));

    await db.shopifyOrderLineItem.deleteMany({
      where: { orderId: { in: [...idPorExterno.values()] } },
    });

    const renglones = lote.flatMap((o) => {
      const orderId = idPorExterno.get(o.externalId);
      if (!orderId) return [];
      return o.lineItems.map((li) => ({
        orderId,
        productName: li.productName,
        quantity: li.quantity,
        amount: li.amount,
      }));
    });
    if (renglones.length > 0) {
      await db.shopifyOrderLineItem.createMany({ data: renglones });
    }
  }

  return { ordersSynced: orders.length, creadas, actualizadas };
}
