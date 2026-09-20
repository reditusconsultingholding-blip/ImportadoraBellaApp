import { db } from "@/lib/db";
import { memorizar } from "@/lib/memoria";
import { pedidosRealesPorDia } from "@/lib/pedidos-reales";
import { nombresSinEnlazar } from "@/lib/enlazar-pedidos";
import type { Range } from "@/lib/date-range";

// De dónde vienen las ventas que la pauta no explica.
//
// EL PROBLEMA
// El panel decía "232 órdenes, 200 las explica la pauta" y ahí terminaba: las
// otras 32 quedaban como un misterio que el cliente vive preguntando.
//
// LO QUE SE INTENTÓ PRIMERO Y NO ALCANZA
// Shopify guarda el recorrido de cada comprador (con qué enlace entró, quién
// lo refirió). Acá viene VACÍO: el 92% de las ventas entra por Funnelish y el
// resto por Releasit, que cobran fuera de Shopify. La tienda recibe la orden
// hecha y nunca ve la visita. Los atributos que sí manda el formulario son
// datos del comprador, no de origen. Mientras el embudo no pase los utm, ese
// camino no existe — y decirlo es parte del reporte.
//
// LO QUE SÍ SE PUEDE SABER, Y ES LO QUE HACE ESTE MÓDULO
// Comparar, PRODUCTO POR PRODUCTO, los pedidos reales contra las compras que
// se atribuyen sus propias campañas ese día, y sumarle tres señales que
// explican de dónde sale la diferencia:
//   1. Clientes que ya habían comprado antes (no necesitan un anuncio nuevo).
//   2. Productos que vendieron sin un dólar de pauta ese día.
//   3. Nombres de Shopify todavía sin enlazar a un producto.
// Lo que sobra después de eso es sub-registro del píxel, que es un hecho
// conocido de Meta y TikTok, no una venta perdida.

export type FilaProducto = {
  productId: string;
  producto: string;
  codigo: string;
  reales: number;
  atribuidas: number;
  gasto: number;
  /** Reales − atribuidas. Positivo = la pauta reportó de menos. */
  diferencia: number;
};

export type ReporteOrigen = {
  desde: string;
  hasta: string;
  ordenes: number;
  atribuidas: number;
  gasto: number;
  /** Órdenes de clientes que ya habían comprado antes del período. */
  recompras: number;
  /** Cuándo fue la compra anterior de esos clientes. */
  recompraPorAntiguedad: { tramo: string; clientes: number }[];
  /** Pedidos cuyo nombre de Shopify todavía no está enlazado a un producto. */
  sinEnlazar: number;
  nombresSinEnlazar: { nombre: string; pedidos: number }[];
  /** Productos que vendieron sin nada de pauta en el período. */
  sinPauta: FilaProducto[];
  porProducto: FilaProducto[];
  /** Cuántas órdenes traen algún dato de origen propio (utm o referente). */
  conOrigenPropio: number;
};

const TRAMOS: [string, number][] = [
  ["Hoy mismo", 1],
  ["Menos de una semana", 7],
  ["Una a cuatro semanas", 30],
  ["Uno a tres meses", 90],
];

async function reporteDeOrigenSinMemoria(organizationId: string, range: Range): Promise<ReporteOrigen> {
  const desdeDia = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), range.from.getUTCDate()));
  const hastaDia = new Date(Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), range.to.getUTCDate()));

  const [dias, sinEnlazarNombres, atribucionPorProducto, productos, recompra, conOrigen] = await Promise.all([
    // Los pedidos REALES por producto, con la misma regla del control:
    // un pedido = un producto, sin testeo ni envío prioritario.
    pedidosRealesPorDia(organizationId, range.fromInstant, range.toInstant),
    nombresSinEnlazar(organizationId, desdeDia, hastaDia),
    db.$queryRaw<{ productId: string | null; compras: number; gasto: number }[]>`
      SELECT c."productId", coalesce(sum(m.purchases), 0)::int AS compras, coalesce(sum(m.spend), 0)::float8 AS gasto
        FROM "MetricSnapshot" m
        JOIN "Campaign" c ON c.id = m."campaignId"
        JOIN "AdAccount" a ON a.id = c."adAccountId"
       WHERE a."organizationId" = ${organizationId}
         AND m."capturedAt" >= ${desdeDia} AND m."capturedAt" <= ${hastaDia}
       GROUP BY 1`,
    db.product.findMany({ where: { organizationId }, select: { id: true, name: true, code: true } }),
    db.$queryRaw<{ tramo: number; clientes: number; ordenes: number }[]>`
      WITH compras AS (
        SELECT o.id, o."clienteTelefono" tel, o."occurredAt"
          FROM "ShopifyOrder" o JOIN "ShopifyStore" s ON s.id = o."storeId"
         WHERE s."organizationId" = ${organizationId}
           AND o."occurredAt" >= ${range.fromInstant} AND o."occurredAt" <= ${range.toInstant}
           AND o."clienteTelefono" IS NOT NULL),
      previa AS (
        SELECT c.id, c.tel,
               extract(epoch from (c."occurredAt" - max(p."occurredAt"))) / 86400 AS dias
          FROM compras c
          JOIN "ShopifyOrder" p ON p."clienteTelefono" = c.tel AND p."occurredAt" < ${range.fromInstant}
         GROUP BY c.id, c.tel, c."occurredAt")
      SELECT CASE WHEN dias < 1 THEN 0 WHEN dias < 7 THEN 1 WHEN dias < 30 THEN 2 WHEN dias < 90 THEN 3 ELSE 4 END AS tramo,
             count(DISTINCT tel)::int AS clientes, count(*)::int AS ordenes
        FROM previa GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "ShopifyOrder" o JOIN "ShopifyStore" s ON s.id = o."storeId"
       WHERE s."organizationId" = ${organizationId}
         AND o."occurredAt" >= ${range.fromInstant} AND o."occurredAt" <= ${range.toInstant}
         AND (o."utmSource" IS NOT NULL OR o."referrerUrl" IS NOT NULL OR o."origenFuente" IS NOT NULL)`,
  ]);

  const nombre = new Map(productos.map((p) => [p.id, p]));
  const atribuidoDe = new Map(atribucionPorProducto.filter((a) => a.productId).map((a) => [a.productId!, a]));

  const realesPorProducto = new Map<string, number>();
  let sinAsignar = 0;
  for (const d of dias) {
    for (const [id, n] of d.porProducto) realesPorProducto.set(id, (realesPorProducto.get(id) ?? 0) + n);
    sinAsignar += d.sinAsignar;
  }

  const porProducto: FilaProducto[] = [...realesPorProducto.entries()]
    .map(([id, reales]) => {
      const a = atribuidoDe.get(id);
      const p = nombre.get(id);
      return {
        productId: id,
        producto: p?.name ?? "Producto sin nombre",
        codigo: p?.code ?? "",
        reales,
        atribuidas: a?.compras ?? 0,
        gasto: a?.gasto ?? 0,
        diferencia: reales - (a?.compras ?? 0),
      };
    })
    .sort((a, b) => b.diferencia - a.diferencia);

  const ordenes = [...realesPorProducto.values()].reduce((s, n) => s + n, 0) + sinAsignar;
  const atribuidas = atribucionPorProducto.reduce((s, a) => s + a.compras, 0);
  const gasto = atribucionPorProducto.reduce((s, a) => s + a.gasto, 0);

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    desde: iso(range.from),
    hasta: iso(range.to),
    ordenes,
    atribuidas,
    gasto,
    recompras: recompra.reduce((s, r) => s + r.ordenes, 0),
    recompraPorAntiguedad: recompra.map((r) => ({
      tramo: TRAMOS[r.tramo]?.[0] ?? "Más de tres meses",
      clientes: r.clientes,
    })),
    sinEnlazar: sinAsignar,
    nombresSinEnlazar: sinEnlazarNombres.slice(0, 15).map((n) => ({ nombre: n.nombre, pedidos: n.pedidos })),
    sinPauta: porProducto.filter((p) => p.gasto === 0),
    porProducto,
    conOrigenPropio: conOrigen[0]?.n ?? 0,
  };
}

export const reporteDeOrigen = memorizar("origen-ventas.reporteDeOrigen", reporteDeOrigenSinMemoria);
