import { db } from "@/lib/db";
import { memorizar } from "@/lib/memoria";

// "Campañas del año": el tablero que el dueño armó en Looker Studio, dentro
// de la app.
//
// Gasto, conversiones y CPA por mes, por plataforma y por producto, con
// filtros de plataforma, centro de negocios y producto. Las conversiones son
// las que reportan Meta y TikTok (igual que en el Looker), no las ventas de
// Shopify: para eso está el CPA general del Panel y el Origen de las ventas.
//
// Se devuelve el año agregado por mes × cuenta × producto y los filtros se
// aplican en el navegador: son unos pocos miles de filas y así cambiar un
// filtro es instantáneo, sin volver a preguntarle nada a la base.

export type FilaCampanas = {
  /** "2026-03" */
  mes: string;
  plataforma: "META" | "TIKTOK";
  cuentaId: string;
  productoId: string | null;
  gasto: number;
  conversiones: number;
  ingreso: number;
};

export type CampanasDelAno = {
  anio: number;
  aniosDisponibles: number[];
  filas: FilaCampanas[];
  cuentas: { id: string; nombre: string; plataforma: "META" | "TIKTOK"; centro: string }[];
  productos: { id: string; codigo: string; nombre: string }[];
};

/**
 * El centro de negocios de una cuenta, sacado del nombre.
 *
 * Las cuentas de Meta se llaman "CP1 - Mundo Hogar", "CP2 - Bellav Corp": lo
 * que va después del guion es el portafolio. Windsor no entrega el
 * Business Manager, así que es la mejor fuente que hay. Las de TikTok no
 * siguen esa regla y quedan todas en "TikTok".
 */
function centroDe(nombre: string, plataforma: string) {
  if (plataforma !== "META") return "TikTok";
  const m = nombre.match(/-\s*(.+)$/);
  return m ? m[1].trim() : "Sin centro";
}

async function campanasDelAnoSinMemoria(organizationId: string, anio: number): Promise<CampanasDelAno> {
  const desde = new Date(Date.UTC(anio, 0, 1));
  const hasta = new Date(Date.UTC(anio + 1, 0, 1));

  const [filas, cuentas, anios] = await Promise.all([
    db.$queryRaw<
      { mes: string; plataforma: "META" | "TIKTOK"; cuentaId: string; productoId: string | null; gasto: number; conversiones: number; ingreso: number }[]
    >`
      SELECT to_char(m."capturedAt", 'YYYY-MM') AS mes,
             a.platform::text AS plataforma,
             a.id AS "cuentaId",
             c."productId" AS "productoId",
             sum(m.spend)::float8 AS gasto,
             sum(m.purchases)::int AS conversiones,
             sum(m.revenue)::float8 AS ingreso
        FROM "MetricSnapshot" m
        JOIN "Campaign" c ON c.id = m."campaignId"
        JOIN "AdAccount" a ON a.id = c."adAccountId"
       WHERE a."organizationId" = ${organizationId}
         AND m."capturedAt" >= ${desde} AND m."capturedAt" < ${hasta}
       GROUP BY 1, 2, 3, 4
      HAVING sum(m.spend) > 0 OR sum(m.purchases) > 0`,
    db.adAccount.findMany({
      where: { organizationId },
      select: { id: true, name: true, platform: true },
    }),
    db.$queryRaw<{ anio: number }[]>`
      SELECT DISTINCT extract(year from m."capturedAt")::int AS anio
        FROM "MetricSnapshot" m
        JOIN "Campaign" c ON c.id = m."campaignId"
        JOIN "AdAccount" a ON a.id = c."adAccountId"
       WHERE a."organizationId" = ${organizationId}
       ORDER BY 1 DESC`,
  ]);

  const idsProducto = [...new Set(filas.map((f) => f.productoId).filter((x): x is string => Boolean(x)))];
  const productos = idsProducto.length
    ? await db.product.findMany({ where: { id: { in: idsProducto } }, select: { id: true, code: true, name: true } })
    : [];

  return {
    anio,
    aniosDisponibles: anios.map((a) => a.anio),
    filas,
    cuentas: cuentas.map((c) => ({
      id: c.id,
      nombre: c.name.trim(),
      plataforma: c.platform as "META" | "TIKTOK",
      centro: centroDe(c.name.trim(), c.platform),
    })),
    productos: productos.map((p) => ({ id: p.id, codigo: p.code, nombre: p.name })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
  };
}

export const campanasDelAno = memorizar("ceo-campanas.campanasDelAno", campanasDelAnoSinMemoria);
