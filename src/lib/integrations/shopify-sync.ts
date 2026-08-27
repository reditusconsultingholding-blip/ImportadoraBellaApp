import { db } from "@/lib/db";
import { fetchRecentOrders } from "./shopify";

// Trae las órdenes de los últimos días y las guarda. Se llama al conectar
// y desde el cron (ver /api/cron/sync), igual que syncAdAccount para Meta/TikTok.
export async function syncShopifyStore(storeId: string) {
  const store = await db.shopifyStore.findUniqueOrThrow({ where: { id: storeId } });

  const since = new Date();
  since.setDate(since.getDate() - 2);

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
