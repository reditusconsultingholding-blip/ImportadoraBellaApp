import { db } from "@/lib/db";
import { memorizar } from "@/lib/memoria";
import { clasificarNombres } from "@/lib/pedidos-reales";
import type { Range } from "@/lib/date-range";

// De dónde viene CADA venta, una por una, y que la cuenta cierre.
//
// POR QUÉ OTRA VERSIÓN
// El primer reporte de origen daba "señales": cuántas ventas eran de clientes
// que volvían, cuántas de productos sin pauta, cuántas sin enlazar. Eran
// ciertas, pero se pisaban entre sí —una venta podía estar en dos— y no
// sumaban el total. Para quien tiene que dar el visto bueno eso se lee como
// "los números no cuadran". Acá cada venta cae en UNA sola caja, las cajas
// suman exactamente las ventas de la tienda, y cada venta se puede ver en la
// lista con el motivo de su caja.
//
// LAS CAJAS, EN ESTE ORDEN (la primera que aplica es la que vale)
//   1. Testeo: el producto está marcado como testeo. El control no lo cuenta.
//   2. Producto sin identificar: el nombre de Shopify no está enlazado a
//      ningún producto, así que no se puede saber si tenía pauta.
//   3. Sin pauta ese día: el producto no gastó un dólar ni en Meta ni en
//      TikTok ese día (hora de Ecuador). No la trajo un anuncio de ese día.
//   4. Con pauta ese día: el producto sí tenía campañas gastando. Se separa
//      en solo Meta, solo TikTok, o las dos.
//
// LO QUE NO SE PUEDE SABER, Y POR QUÉ
// Qué anuncio exacto trajo a cada comprador. Las ventas entran por Funnelish
// y Releasit, que cobran fuera de Shopify: la orden llega hecha y sin el
// enlace de la visita (sin utm). Por eso, dentro de la caja 4, lo que se
// compara es por producto y por día: cuántas ventas reales hubo contra
// cuántas compras se atribuyen Meta y TikTok. La diferencia es lo que los
// píxeles no reportan.
//
// Aparte, y sin ser una caja: si el comprador ya había comprado antes (mismo
// teléfono). Es un dato de cada venta, no un origen.

export type Caja = "testeo" | "sin_identificar" | "sin_pauta" | "meta" | "tiktok" | "ambas";

export const NOMBRE_CAJA: Record<Caja, string> = {
  testeo: "Testeo",
  sin_identificar: "Producto sin identificar",
  sin_pauta: "Producto sin pauta ese día",
  meta: "Pauta solo en Meta",
  tiktok: "Pauta solo en TikTok",
  ambas: "Pauta en Meta y TikTok",
};

export type VentaConOrigen = {
  /** El número de la orden en Shopify (el que se busca en el admin). */
  shopifyId: string;
  dia: string;
  hora: string;
  canal: string;
  producto: string;
  caja: Caja;
  recurrente: boolean;
  facturado: number;
};

export type ConciliacionProducto = {
  producto: string;
  ventas: number;
  meta: number;
  tiktok: number;
  /** Ventas reales que ningún píxel reportó (nunca negativo). */
  sinReportar: number;
  /** Compras que los píxeles reportaron de más sobre las ventas reales. */
  deMas: number;
};

export type OrigenPorVenta = {
  total: number;
  cajas: Record<Caja, number>;
  recurrentes: number;
  canales: { canal: string; ventas: number }[];
  /** Dentro de "con pauta": lo que reportan los píxeles contra lo real. */
  conPauta: number;
  reportaMeta: number;
  reportaTiktok: number;
  sinReportar: number;
  deMas: number;
  porProducto: ConciliacionProducto[];
  ventas: VentaConOrigen[];
  /** Órdenes que traen utm o sitio de referencia (hoy, ninguna). */
  conUtm: number;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function origenPorVentaSinMemoria(organizationId: string, range: Range): Promise<OrigenPorVenta> {
  const clasificados = await clasificarNombres(organizationId);
  const nombres = clasificados.map((c) => c.nombre);
  const clases = clasificados.map((c) => c.clase);
  const productos = clasificados.map((c) => c.productId ?? "");

  const desdeDia = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), range.from.getUTCDate()));
  const hastaDia = new Date(Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), range.to.getUTCDate()));

  const [ordenes, pauta, nombresProducto] = await Promise.all([
    // Cada orden con UNA línea elegida, con la misma prioridad que usa el
    // control: producto enlazado > sin enlazar > testeo > envío/garantía.
    db.$queryRaw<
      {
        externalId: string;
        occurredAt: Date;
        channel: string;
        netSales: number;
        clase: string | null;
        productId: string | null;
        nombre: string | null;
        recurrente: boolean;
        conUtm: boolean;
      }[]
    >`
      WITH mapa AS (
        SELECT * FROM unnest(${nombres}::text[], ${clases}::text[], ${productos}::text[]) AS m(nombre, clase, "productId")
      ),
      ordenes AS (
        SELECT o.id, o."externalId", o."occurredAt", o.channel, o."netSales", o."clienteTelefono",
               (o."utmSource" IS NOT NULL OR o."referrerUrl" IS NOT NULL) AS "conUtm"
          FROM "ShopifyOrder" o JOIN "ShopifyStore" s ON s.id = o."storeId"
         WHERE s."organizationId" = ${organizationId}
           AND o."occurredAt" >= ${range.fromInstant} AND o."occurredAt" <= ${range.toInstant}
      ),
      linea AS (
        SELECT DISTINCT ON (li."orderId") li."orderId", m.clase, nullif(m."productId", '') AS "productId", li."productName" AS nombre
          FROM "ShopifyOrderLineItem" li
          JOIN ordenes o ON o.id = li."orderId"
          LEFT JOIN mapa m ON m.nombre = li."productName"
         ORDER BY li."orderId",
                  CASE m.clase WHEN 'producto' THEN 0 WHEN 'sin' THEN 1 WHEN 'testeo' THEN 2 ELSE 3 END,
                  li.amount DESC
      )
      SELECT o."externalId", o."occurredAt", o.channel, o."netSales", l.clase, l."productId", l.nombre, o."conUtm",
             EXISTS (
               SELECT 1 FROM "ShopifyOrder" p
                WHERE o."clienteTelefono" IS NOT NULL
                  AND p."clienteTelefono" = o."clienteTelefono"
                  AND p."occurredAt" < o."occurredAt"
             ) AS recurrente
        FROM ordenes o LEFT JOIN linea l ON l."orderId" = o.id
       ORDER BY o."occurredAt" DESC`,
    // Qué producto gastó en qué plataforma cada día, y cuántas compras se
    // atribuyó. capturedAt es la marca de día (medianoche UTC del día de
    // Ecuador), igual que en todo el resto de la app.
    db.$queryRaw<{ dia: Date; productId: string; platform: string; gasto: number; compras: number }[]>`
      SELECT m."capturedAt" AS dia, c."productId", a.platform::text AS platform,
             sum(m.spend)::float8 AS gasto, sum(m.purchases)::int AS compras
        FROM "MetricSnapshot" m
        JOIN "Campaign" c ON c.id = m."campaignId"
        JOIN "AdAccount" a ON a.id = c."adAccountId"
       WHERE a."organizationId" = ${organizationId}
         AND c."productId" IS NOT NULL
         AND m."capturedAt" >= ${desdeDia} AND m."capturedAt" <= ${hastaDia}
       GROUP BY 1, 2, 3`,
    db.product.findMany({ where: { organizationId }, select: { id: true, name: true } }),
  ]);

  const nombreDe = new Map(nombresProducto.map((p) => [p.id, p.name]));

  // producto+día → gasto y compras por plataforma
  const clave = (dia: string, productId: string) => `${dia}|${productId}`;
  const pautaDe = new Map<string, { meta: number; tiktok: number; comprasMeta: number; comprasTiktok: number }>();
  for (const p of pauta) {
    const k = clave(iso(p.dia), p.productId);
    const x = pautaDe.get(k) ?? { meta: 0, tiktok: 0, comprasMeta: 0, comprasTiktok: 0 };
    if (p.platform === "META") {
      x.meta += p.gasto;
      x.comprasMeta += p.compras;
    } else if (p.platform === "TIKTOK") {
      x.tiktok += p.gasto;
      x.comprasTiktok += p.compras;
    }
    pautaDe.set(k, x);
  }

  const cajas: Record<Caja, number> = { testeo: 0, sin_identificar: 0, sin_pauta: 0, meta: 0, tiktok: 0, ambas: 0 };
  const canales = new Map<string, number>();
  const ventasConPauta = new Map<string, number>(); // producto+día → ventas reales con pauta
  const ventas: VentaConOrigen[] = [];
  let recurrentes = 0;
  let conUtm = 0;

  for (const o of ordenes) {
    // El día y la hora de Ecuador.
    const local = new Date(o.occurredAt.getTime() - 5 * 3600_000);
    const dia = iso(local);
    const hora = local.toISOString().slice(11, 16);

    let caja: Caja;
    if (o.clase === "testeo") caja = "testeo";
    else if (o.clase !== "producto" || !o.productId) caja = "sin_identificar";
    else {
      const p = pautaDe.get(clave(dia, o.productId));
      const enMeta = (p?.meta ?? 0) > 0;
      const enTiktok = (p?.tiktok ?? 0) > 0;
      caja = enMeta && enTiktok ? "ambas" : enMeta ? "meta" : enTiktok ? "tiktok" : "sin_pauta";
      if (caja !== "sin_pauta") {
        const k = clave(dia, o.productId);
        ventasConPauta.set(k, (ventasConPauta.get(k) ?? 0) + 1);
      }
    }

    cajas[caja] += 1;
    canales.set(o.channel, (canales.get(o.channel) ?? 0) + 1);
    if (o.recurrente) recurrentes += 1;
    if (o.conUtm) conUtm += 1;

    ventas.push({
      shopifyId: o.externalId.split("/").pop() ?? o.externalId,
      dia,
      hora,
      canal: o.channel,
      producto: o.productId ? (nombreDe.get(o.productId) ?? o.nombre ?? "—") : (o.nombre ?? "Sin líneas"),
      caja,
      recurrente: o.recurrente,
      facturado: o.netSales,
    });
  }

  // La conciliación de la caja "con pauta", producto por producto y día por
  // día: lo real contra lo que se atribuyen los píxeles. Por día, porque un
  // píxel que reporta de más el lunes no compensa uno que reporta de menos el
  // martes: son dos errores, no cero.
  const porProductoMapa = new Map<string, ConciliacionProducto>();
  let reportaMeta = 0;
  let reportaTiktok = 0;
  let sinReportar = 0;
  let deMas = 0;
  const claves = new Set([...ventasConPauta.keys(), ...pautaDe.keys()]);
  for (const k of claves) {
    const [, productId] = k.split("|");
    const reales = ventasConPauta.get(k) ?? 0;
    const p = pautaDe.get(k);
    const meta = p?.comprasMeta ?? 0;
    const tiktok = p?.comprasTiktok ?? 0;
    const falta = Math.max(0, reales - meta - tiktok);
    const sobra = Math.max(0, meta + tiktok - reales);
    reportaMeta += meta;
    reportaTiktok += tiktok;
    sinReportar += falta;
    deMas += sobra;
    const nombre = nombreDe.get(productId) ?? "Producto";
    const f = porProductoMapa.get(productId) ?? { producto: nombre, ventas: 0, meta: 0, tiktok: 0, sinReportar: 0, deMas: 0 };
    f.ventas += reales;
    f.meta += meta;
    f.tiktok += tiktok;
    f.sinReportar += falta;
    f.deMas += sobra;
    porProductoMapa.set(productId, f);
  }

  return {
    total: ordenes.length,
    cajas,
    recurrentes,
    canales: [...canales.entries()].map(([canal, n]) => ({ canal, ventas: n })).sort((a, b) => b.ventas - a.ventas),
    conPauta: cajas.meta + cajas.tiktok + cajas.ambas,
    reportaMeta,
    reportaTiktok,
    sinReportar,
    deMas,
    porProducto: [...porProductoMapa.values()]
      .filter((f) => f.ventas > 0 || f.meta + f.tiktok > 0)
      .sort((a, b) => b.ventas - a.ventas),
    ventas,
    conUtm,
  };
}

export const origenPorVenta = memorizar("origen-pedidos.origenPorVenta", origenPorVentaSinMemoria);
