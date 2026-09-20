import { db } from "@/lib/db";
import { memorizar } from "@/lib/memoria";
import { clasificarNombres } from "@/lib/pedidos-reales";

// Los testeos, que hasta ahora eran un número suelto.
//
// EL PROBLEMA
// El control publicitario deja los pedidos de testeo AFUERA de la cuenta —el
// equipo no los suma al mes, son gasto de prueba— y eso está bien. Pero la
// diferencia quedaba flotando: en agosto Shopify tenía 11.923 órdenes y el
// control mostraba 11.753, sin ningún lugar donde ver a dónde fueron las 170.
//
// DOS COSAS DISTINTAS QUE NO HAY QUE MEZCLAR
//  1. Los PEDIDOS de testeo: los que se marcaron así en "Enlazar pedidos".
//     Son los que explican, uno a uno, la diferencia con Shopify. Se cuentan
//     con la misma regla que el resto del control (un pedido = un producto,
//     con la misma prioridad de líneas), para que los números cierren.
//  2. El GASTO de las campañas con nomenclatura de testeo (".../TEST/..."):
//     eso NO es "plata gastada en productos de prueba". En esta cuenta 825 de
//     las 1.179 campañas de agosto llevan TEST en el nombre y son el 72% del
//     gasto: la fase de testeo de creativos de productos que ya venden. Se
//     muestra aparte y con esa aclaración, porque sumarlo como "gasto de
//     testeos" daría un número alarmante y falso.

export type FilaTesteo = { nombre: string; pedidos: number; facturado: number };
export type GastoTesteo = { producto: string; campanas: number; gasto: number; compras: number };

export type ResumenTesteos = {
  /** Pedidos marcados como testeo: la diferencia contra Shopify. */
  pedidos: number;
  facturado: number;
  porNombre: FilaTesteo[];
  /** Campañas en fase de prueba (nomenclatura TEST), que es otra cosa. */
  gastoCampanasTest: number;
  campanasTest: number;
  porProducto: GastoTesteo[];
};

async function testeosDelPeriodoSinMemoria(
  organizationId: string,
  desde: Date,
  hasta: Date,
): Promise<ResumenTesteos> {
  const clasificados = await clasificarNombres(organizationId);
  const nombres = clasificados.map((c) => c.nombre);
  const clases = clasificados.map((c) => c.clase);

  const [pedidos, gastos] = await Promise.all([
    nombres.length === 0
      ? Promise.resolve([] as FilaTesteo[])
      : db.$queryRaw<FilaTesteo[]>`
          WITH mapa AS (
            SELECT * FROM unnest(${nombres}::text[], ${clases}::text[]) AS m(nombre, clase)
          ),
          lineas AS (
            SELECT o.id AS "orderId", o."netSales", m.clase, li."productName" AS nombre, li.amount
              FROM "ShopifyOrderLineItem" li
              JOIN "ShopifyOrder" o ON o.id = li."orderId"
              JOIN "ShopifyStore" s ON s.id = o."storeId"
              JOIN mapa m ON m.nombre = li."productName"
             WHERE s."organizationId" = ${organizationId}
               AND o."occurredAt" >= ${desde} AND o."occurredAt" < ${hasta}
          ),
          -- La MISMA prioridad que usa el control: si el pedido trae algo
          -- enlazado o sin enlazar, no es un pedido de testeo.
          principal AS (
            SELECT DISTINCT ON ("orderId") "orderId", "netSales", clase, nombre
              FROM lineas
             ORDER BY "orderId",
                      CASE clase WHEN 'producto' THEN 0 WHEN 'sin' THEN 1 WHEN 'testeo' THEN 2 ELSE 3 END,
                      amount DESC
          )
          SELECT nombre, count(*)::int AS pedidos, coalesce(sum("netSales"), 0)::float8 AS facturado
            FROM principal
           WHERE clase = 'testeo'
           GROUP BY 1 ORDER BY 2 DESC`,
    db.$queryRaw<{ producto: string | null; campanas: number; gasto: number; compras: number }[]>`
      SELECT p.name AS producto,
             count(DISTINCT c.id)::int AS campanas,
             coalesce(sum(m.spend), 0)::float8 AS gasto,
             coalesce(sum(m.purchases), 0)::int AS compras
        FROM "MetricSnapshot" m
        JOIN "Campaign" c ON c.id = m."campaignId"
        JOIN "AdAccount" a ON a.id = c."adAccountId"
        LEFT JOIN "Product" p ON p.id = c."productId"
       WHERE a."organizationId" = ${organizationId}
         AND c."tipoCampana" = 'TESTEO'
         AND m."capturedAt" >= ${new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()))}
         AND m."capturedAt" <= ${hasta}
       GROUP BY 1 ORDER BY 3 DESC`,
  ]);

  return {
    pedidos: pedidos.reduce((s, p) => s + p.pedidos, 0),
    facturado: pedidos.reduce((s, p) => s + p.facturado, 0),
    porNombre: pedidos,
    gastoCampanasTest: gastos.reduce((s, g) => s + g.gasto, 0),
    campanasTest: gastos.reduce((s, g) => s + g.campanas, 0),
    porProducto: gastos.map((g) => ({
      producto: g.producto ?? "Sin producto asignado",
      campanas: g.campanas,
      gasto: g.gasto,
      compras: g.compras,
    })),
  };
}

export const testeosDelPeriodo = memorizar("testeos.testeosDelPeriodo", testeosDelPeriodoSinMemoria);
