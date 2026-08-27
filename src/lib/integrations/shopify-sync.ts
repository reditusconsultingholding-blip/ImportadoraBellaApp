import { db } from "@/lib/db";
import { fetchRecentOrders } from "./shopify";

// Trae las órdenes de los últimos días y las guarda. Se llama al conectar
// y desde el cron (ver /api/cron/sync), igual que syncAdAccount para Meta/TikTok.
export async function syncShopifyStore(storeId: string, days?: number) {
  const store = await db.shopifyStore.findUniqueOrThrow({ where: { id: storeId } });

  // La primera vez se traen 30 días, para que Ventas y Rentabilidad tengan
  // algo que mostrar desde el minuto uno. Después alcanza con los últimos 2:
  // el cron corre cada 15 minutos y volver a pedir un mes entero en cada
  // corrida sería tirar cuota de la API a la basura.
  const yaTieneOrdenes = await db.shopifyOrder.count({ where: { storeId: store.id } });
  const since = new Date();
  since.setDate(since.getDate() - (yaTieneOrdenes > 0 ? 2 : 30));

  const orders = await fetchRecentOrders(store.shopDomain, store.accessToken, since.toISOString());

  for (const o of orders) {
    const order = await db.shopifyOrder.upsert({
      where: { storeId_externalId: { storeId: store.id, externalId: o.externalId } },
      create: {
        storeId: store.id,
        externalId: o.externalId,
        occurredAt: new Date(o.occurredAt),
        channel: o.channel,
        grossSales: o.grossSales,
        discounts: o.discounts,
        shipping: o.shipping,
        taxes: o.taxes,
        netSales: o.netSales,
      },
      update: {
        channel: o.channel,
        grossSales: o.grossSales,
        discounts: o.discounts,
        shipping: o.shipping,
        taxes: o.taxes,
        netSales: o.netSales,
      },
    });

    await db.shopifyOrderLineItem.deleteMany({ where: { orderId: order.id } });
    for (const li of o.lineItems) {
      await db.shopifyOrderLineItem.create({
        data: {
          orderId: order.id,
          productName: li.productName,
          quantity: li.quantity,
          amount: li.amount,
        },
      });
    }
  }

  return { ordersSynced: orders.length };
}
