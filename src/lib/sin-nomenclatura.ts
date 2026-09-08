import { db } from "@/lib/db";
import type { Range } from "@/lib/date-range";

// Lo que la nomenclatura no logró conectar.
//
// El panel dice, en el cruce de atribución, que una parte de las órdenes no la
// explica ni la pauta ni la recompra, y menciona entre las causas "campañas sin
// la nomenclatura que las conecta con su producto". Dicho así es una hipótesis
// que nadie puede comprobar ni corregir: no hay forma de saber CUÁLES son esas
// campañas, cuánto están gastando, ni dónde ir a arreglarlas.
//
// Acá se calculan. Una campaña sin producto asignado sigue gastando plata y
// sigue generando compras; lo único que no hace es sumar a la rentabilidad de
// ningún producto. Por eso el orden es por gasto: la que más plata mueve es la
// que más distorsiona los números, y es la primera que hay que emparejar.
//
// El otro lado del mismo problema son los productos que no tienen ni una
// campaña colgando. O nunca se pautaron, o su código no aparece en el nombre de
// ninguna campaña. Los dos casos se ven igual desde acá y los dos se arreglan
// en el mismo sitio.

export type CampanaSinProducto = {
  id: string;
  nombre: string;
  plataforma: "META" | "TIKTOK";
  cuenta: string;
  activa: boolean;
  /** Gasto en el período mirado. */
  gasto: number;
  /** Compras que la plataforma le atribuye en el período. */
  compras: number;
};

export type ProductoSinCampana = {
  id: string;
  code: string;
  name: string;
};

/**
 * Las campañas que no están conectadas a ningún producto, con su plata.
 *
 * Va en SQL crudo y no por la API de Prisma porque hace falta agregar las
 * métricas del período POR campaña y ordenar por el resultado. Con la API serían
 * dos viajes —traer las campañas, después agrupar sus snapshots— y ordenar en
 * Node sobre una lista que puede tener miles de filas, para terminar mostrando
 * las que gastaron.
 *
 * El LEFT JOIN es a propósito: una campaña sin producto que además no gastó
 * nada en el período sigue siendo una campaña sin producto, y tiene que
 * aparecer en la lista aunque sea al final. Si el JOIN fuera interno,
 * desaparecerían justo las que están pausadas —que son las más fáciles de
 * arreglar sin riesgo.
 */
export async function campanasSinProducto(
  organizationId: string,
  range: Range,
  limite = 300,
): Promise<CampanaSinProducto[]> {
  const filas = await db.$queryRaw<
    {
      id: string;
      name: string;
      status: string;
      platform: "META" | "TIKTOK";
      cuenta: string;
      spend: number;
      purchases: number;
    }[]
  >`
    SELECT c.id,
           c.name,
           c.status,
           a.platform,
           a.name AS cuenta,
           coalesce(sum(m.spend), 0)::float8    AS spend,
           coalesce(sum(m.purchases), 0)::int   AS purchases
    FROM "Campaign" c
    JOIN "AdAccount" a ON a.id = c."adAccountId"
    LEFT JOIN "MetricSnapshot" m
      ON m."campaignId" = c.id
     AND m."capturedAt" >= ${range.from}
     AND m."capturedAt" <= ${range.to}
    WHERE a."organizationId" = ${organizationId}
      AND c."productId" IS NULL
      AND c.archivada = false
    GROUP BY c.id, c.name, c.status, a.platform, a.name
    ORDER BY spend DESC, c.name ASC
    LIMIT ${limite}
  `;

  return filas.map((f) => ({
    id: f.id,
    nombre: f.name,
    plataforma: f.platform,
    cuenta: f.cuenta,
    activa: f.status === "ACTIVE",
    gasto: Number(f.spend) || 0,
    compras: Number(f.purchases) || 0,
  }));
}

/** Productos sin una sola campaña conectada: o no se pautaron, o no matchearon. */
export async function productosSinCampana(
  organizationId: string,
): Promise<ProductoSinCampana[]> {
  return db.product.findMany({
    where: {
      organizationId,
      archived: false,
      campaigns: { none: {} },
    },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });
}

/* -------------------------------------------------------------------------- */

export type ResumenSinProducto = {
  /** Cuántas campañas quedaron sin producto. */
  campanas: number;
  /** De esas, cuántas gastaron algo en el período. */
  conGasto: number;
  gasto: number;
  compras: number;
};

/**
 * El titular, para poder decirlo al lado del cruce de atribución.
 *
 * Se calcula aparte de la lista porque el panel solo necesita los totales: bajar
 * trescientas campañas para contar cuántas son sería pagar la consulta entera
 * por una frase de una línea.
 */
export async function resumenSinProducto(
  organizationId: string,
  range: Range,
): Promise<ResumenSinProducto> {
  const filas = await db.$queryRaw<
    { campanas: bigint; con_gasto: bigint; gasto: number; compras: number }[]
  >`
    WITH por_campana AS (
      SELECT c.id,
             coalesce(sum(m.spend), 0)::float8  AS spend,
             coalesce(sum(m.purchases), 0)::int AS purchases
      FROM "Campaign" c
      JOIN "AdAccount" a ON a.id = c."adAccountId"
      LEFT JOIN "MetricSnapshot" m
        ON m."campaignId" = c.id
       AND m."capturedAt" >= ${range.from}
       AND m."capturedAt" <= ${range.to}
      WHERE a."organizationId" = ${organizationId}
        AND c."productId" IS NULL
        AND c.archivada = false
      GROUP BY c.id
    )
    SELECT count(*)                                  AS campanas,
           count(*) FILTER (WHERE spend > 0)         AS con_gasto,
           coalesce(sum(spend), 0)::float8           AS gasto,
           coalesce(sum(purchases), 0)::int          AS compras
    FROM por_campana
  `;

  const f = filas[0];
  return {
    campanas: Number(f?.campanas ?? 0),
    conGasto: Number(f?.con_gasto ?? 0),
    gasto: Number(f?.gasto ?? 0),
    compras: Number(f?.compras ?? 0),
  };
}
