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
 * (~15.000 órdenes aquí) no llegaba a terminar dentro del request. Aquí se
 * separan las nuevas de las que ya estaban: las nuevas entran con createMany
 * de una, y solo las que ya existían se actualizan de a una, porque sus
 * totales sí cambian (Shopify ajusta descuentos y envíos después).
 */
export async function syncShopifyStore(
  storeId: string,
  days?: number,
  /** Final de la ventana, para rellenar un tramo del pasado sin traer todo. */
  hastaISO?: string
) {
  const store = await db.shopifyStore.findUniqueOrThrow({ where: { id: storeId } });

  // Sin `days` explícito: 30 días la primera vez, para que Ventas y
  // Rentabilidad muestren algo desde el minuto uno; después 2, porque el cron
  // corre cada 15 minutos y volver a pedir un mes entero cada vez sería tirar
  // cuota a la basura.
  const yaTieneOrdenes = await db.shopifyOrder.count({ where: { storeId: store.id } });
  const since = new Date();
  since.setDate(since.getDate() - (days ?? (yaTieneOrdenes > 0 ? 2 : 30)));

  // Hasta dónde vale la pena reescribir lo que ya está guardado.
  const revisarDesde = new Date();
  revisarDesde.setDate(revisarDesde.getDate() - 4);

  const orders = await fetchRecentOrders(
    store.shopDomain,
    store.accessToken,
    since.toISOString(),
    hastaISO
  );

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
          clienteNombre: o.clienteNombre,
          clienteTelefono: o.clienteTelefono,
          clienteEmail: o.clienteEmail,
          provincia: o.provincia,
          ciudad: o.ciudad,
        })),
        skipDuplicates: true,
      });
      creadas += nuevas.length;
    }

    for (const o of lote) {
      if (!yaEstaban.has(o.externalId)) continue;
      // Solo se reescriben las órdenes recientes. Shopify ajusta descuentos y
      // envíos de una compra durante unos días; después de eso el número no se
      // mueve más.
      //
      // Sin este corte, rellenar tres meses obligaba a reescribir de a una las
      // diez mil órdenes que ya estaban, y la petición se pasaba del tiempo del
      // proxy antes de llegar a las nuevas — que eran justo las que faltaban.
      if (new Date(o.occurredAt) < revisarDesde) continue;
      await db.shopifyOrder.update({
        where: { storeId_externalId: { storeId: store.id, externalId: o.externalId } },
        data: {
          channel: o.channel,
          grossSales: o.grossSales,
          discounts: o.discounts,
          shipping: o.shipping,
          taxes: o.taxes,
          netSales: o.netSales,
          clienteNombre: o.clienteNombre,
          clienteTelefono: o.clienteTelefono,
          clienteEmail: o.clienteEmail,
          provincia: o.provincia,
          ciudad: o.ciudad,
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
