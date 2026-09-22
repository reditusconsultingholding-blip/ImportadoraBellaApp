import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { fetchOrderAttribution, fetchRecentOrders } from "./shopify";

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
  hastaISO?: string,
  /**
   * Reescribe TODAS las ordenes del tramo, no solo las recientes.
   *
   * Se usa cuando se agrega un campo nuevo y hay que rellenarlo hacia atras:
   * los datos del cliente, por ejemplo, no existian cuando se importaron las
   * primeras ochenta mil ordenes.
   */
  forzar = false
) {
  const store = await db.shopifyStore.findUniqueOrThrow({ where: { id: storeId } });

  // Sin `days` explícito: 30 días la primera vez, para que Ventas y
  // Rentabilidad muestren algo desde el minuto uno; después 2, porque el cron
  // corre cada 15 minutos y volver a pedir un mes entero cada vez sería tirar
  // cuota a la basura.
  // Alcanza con saber si hay UNA: contar las 90.000 costaba más de medio
  // segundo en cada corrida.
  const yaTieneOrdenes = await db.shopifyOrder.findFirst({ where: { storeId: store.id }, select: { id: true } });
  const since = new Date();
  since.setDate(since.getDate() - (days ?? (yaTieneOrdenes ? 2 : 30)));

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
    //
    // Se trae también lo que tenían guardado, para reescribir solo las que
    // cambiaron. Antes cada vuelta reescribía las ~800 órdenes recientes y
    // todos sus renglones aunque fueran idénticos: miles de escrituras cada
    // pocos minutos, cada una vaciando la memoria de cálculo de las pantallas.
    const previas = await db.shopifyOrder.findMany({
      where: { storeId: store.id, externalId: { in: ids } },
      select: {
        externalId: true,
        channel: true,
        grossSales: true,
        discounts: true,
        shipping: true,
        taxes: true,
        netSales: true,
        clienteNombre: true,
        clienteTelefono: true,
        clienteEmail: true,
        provincia: true,
        ciudad: true,
        lineItems: { select: { productName: true, quantity: true, amount: true } },
      },
    });
    const yaEstaban = new Set(previas.map((p) => p.externalId));
    const previaDe = new Map(previas.map((p) => [p.externalId, p]));
    const firma = (items: { productName: string; quantity: number; amount: number }[]) =>
      items
        .map((i) => `${i.productName}|${i.quantity}|${Math.round(i.amount * 100)}`)
        .sort()
        .join("~");
    const centavos = (n: number) => Math.round(n * 100);
    /** Si algo de la orden es distinto de lo guardado. */
    const cambio = (o: (typeof lote)[number]) => {
      const p = previaDe.get(o.externalId);
      if (!p) return true;
      return (
        p.channel !== o.channel ||
        centavos(p.grossSales) !== centavos(o.grossSales) ||
        centavos(p.discounts) !== centavos(o.discounts) ||
        centavos(p.shipping) !== centavos(o.shipping) ||
        centavos(p.taxes) !== centavos(o.taxes) ||
        centavos(p.netSales) !== centavos(o.netSales) ||
        (p.clienteNombre ?? null) !== (o.clienteNombre ?? null) ||
        (p.clienteTelefono ?? null) !== (o.clienteTelefono ?? null) ||
        (p.clienteEmail ?? null) !== (o.clienteEmail ?? null) ||
        (p.provincia ?? null) !== (o.provincia ?? null) ||
        (p.ciudad ?? null) !== (o.ciudad ?? null) ||
        firma(p.lineItems) !== firma(o.lineItems)
      );
    };

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

    // Las que ya estaban se reescriben EN UN SOLO golpe por lote.
    //
    // De a una era una consulta por orden: rellenar un año con `forzar`
    // significaba 79.000 consultas seguidas, y la petición se pasaba del
    // tiempo del proxy sin alcanzar a escribir casi nada. Con un
    // UPDATE ... FROM (VALUES ...) es una consulta por lote de 400.
    //
    // Por defecto solo se reescriben las recientes: Shopify ajusta descuentos
    // y envíos durante unos días y después el número no se mueve más.
    // `forzar` existe para cuando se agrega un campo nuevo y hay que llenarlo
    // hacia atrás.
    const aReescribir = lote.filter(
      (o) =>
        yaEstaban.has(o.externalId) &&
        (forzar || (new Date(o.occurredAt) >= revisarDesde && cambio(o)))
    );

    if (aReescribir.length > 0) {
      const valores = Prisma.join(
        aReescribir.map(
          (o) => Prisma.sql`(
            ${o.externalId}::text,
            ${o.channel}::text,
            ${o.grossSales}::double precision,
            ${o.discounts}::double precision,
            ${o.shipping}::double precision,
            ${o.taxes}::double precision,
            ${o.netSales}::double precision,
            ${o.clienteNombre}::text,
            ${o.clienteTelefono}::text,
            ${o.clienteEmail}::text,
            ${o.provincia}::text,
            ${o.ciudad}::text
          )`
        )
      );

      await db.$executeRaw`
        UPDATE "ShopifyOrder" AS o
        SET "channel" = v.channel,
            "grossSales" = v.gross,
            "discounts" = v.disc,
            "shipping" = v.ship,
            "taxes" = v.tax,
            "netSales" = v.net,
            "clienteNombre" = v.nombre,
            "clienteTelefono" = v.telefono,
            "clienteEmail" = v.email,
            "provincia" = v.provincia,
            "ciudad" = v.ciudad
        FROM (VALUES ${valores}) AS v(
          ext, channel, gross, disc, ship, tax, net,
          nombre, telefono, email, provincia, ciudad
        )
        WHERE o."storeId" = ${store.id} AND o."externalId" = v.ext`;

      actualizadas += aReescribir.length;
    }
    // Los renglones se reescriben enteros: es más simple que diferenciarlos y
    // el volumen por lote lo aguanta.
    // Solo las nuevas y las que cambiaron.
    const tocadas = [...nuevas, ...aReescribir];
    const guardadas = tocadas.length
      ? await db.shopifyOrder.findMany({
          where: { storeId: store.id, externalId: { in: tocadas.map((o) => o.externalId) } },
          select: { id: true, externalId: true },
        })
      : [];
    const idPorExterno = new Map(guardadas.map((g) => [g.externalId, g.id]));

    if (idPorExterno.size > 0) {
      await db.shopifyOrderLineItem.deleteMany({
        where: { orderId: { in: [...idPorExterno.values()] } },
      });
    }

    const renglones = tocadas.flatMap((o) => {
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

  // De dónde llegó cada comprador. Va después de guardar las órdenes (necesita
  // que existan) y en su propia consulta: si la tienda no expone el recorrido,
  // las ventas ya quedaron sincronizadas igual.
  //
  // Cada 15 minutos y no en cada vuelta: es una consulta más a Shopify que
  // tarda, y el recorrido de una orden no cambia después de creada. Un rango
  // pedido a mano (`days` o `hastaISO`) la hace siempre.
  let conOrigen: number | null = null;
  const ahora = Date.now();
  if (days != null || hastaISO || ahora - (ultimoOrigen.get(store.id) ?? 0) > 15 * 60_000) {
    conOrigen = await enriquecerOrigen(store, since.toISOString(), hastaISO);
    ultimoOrigen.set(store.id, ahora);
  }

  return { ordersSynced: orders.length, creadas, actualizadas, conOrigen };
}

const ultimoOrigen = new Map<string, number>();

/**
 * Escribe el origen de las órdenes de la ventana. Devuelve cuántas quedaron
 * con dato, o null si la tienda no lo expone.
 */
async function enriquecerOrigen(
  store: { id: string; shopDomain: string; accessToken: string | null },
  desdeISO: string,
  hastaISO?: string,
): Promise<number | null> {
  const filas = await fetchOrderAttribution(store.shopDomain, store.accessToken, desdeISO, hastaISO);
  if (!filas) return null;
  if (filas.length === 0) return 0;

  let escritas = 0;
  for (const lote of trozos(filas, LOTE)) {
    // Una sola consulta por lote: con doscientas órdenes al día, fila por fila
    // serían doscientos viajes a la base en cada vuelta del reloj.
    escritas += await db.$executeRaw`
      UPDATE "ShopifyOrder" o
         SET "utmSource" = v.src, "utmMedium" = v.med, "utmCampaign" = v.camp, "utmContent" = v.cont,
             "referrerUrl" = v.ref, "landingPage" = v.land,
             "origenFuente" = v.fuente, "origenTipo" = v.tipo, "origenCrudo" = v.crudo,
             "atribucionAl" = now()
        FROM (
          SELECT * FROM unnest(
            ${lote.map((f) => f.externalId)}::text[],
            ${lote.map((f) => f.utmSource)}::text[],
            ${lote.map((f) => f.utmMedium)}::text[],
            ${lote.map((f) => f.utmCampaign)}::text[],
            ${lote.map((f) => f.utmContent)}::text[],
            ${lote.map((f) => f.referrerUrl)}::text[],
            ${lote.map((f) => f.landingPage)}::text[],
            ${lote.map((f) => f.origenFuente)}::text[],
            ${lote.map((f) => f.origenTipo)}::text[],
            ${lote.map((f) => f.origenCrudo)}::text[]
          ) AS t(ext, src, med, camp, cont, ref, land, fuente, tipo, crudo)
        ) v
       WHERE o."storeId" = ${store.id} AND o."externalId" = v.ext
         -- Solo las que cambian: reescribir lo mismo vaciaba la memoria de
         -- las pantallas sin motivo.
         AND (o."atribucionAl" IS NULL
              OR o."utmSource" IS DISTINCT FROM v.src OR o."utmMedium" IS DISTINCT FROM v.med
              OR o."utmCampaign" IS DISTINCT FROM v.camp OR o."utmContent" IS DISTINCT FROM v.cont
              OR o."referrerUrl" IS DISTINCT FROM v.ref OR o."landingPage" IS DISTINCT FROM v.land
              OR o."origenFuente" IS DISTINCT FROM v.fuente OR o."origenTipo" IS DISTINCT FROM v.tipo
              OR o."origenCrudo" IS DISTINCT FROM v.crudo)`;
  }
  return escritas;
}
