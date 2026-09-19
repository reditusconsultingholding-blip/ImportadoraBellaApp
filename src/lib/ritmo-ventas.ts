import { db } from "@/lib/db";
import { memorizar } from "@/lib/memoria";
import type { Range } from "@/lib/date-range";

// A qué hora compran, dentro del período elegido.
//
// El panel ya dice cuánto se vendió y en qué días. Lo que faltaba es la hora:
// es el dato con el que se decide a qué hora conviene tener presupuesto
// disponible, y hasta ahora había que salir a buscarlo a Shopify.
//
// La hora es la de Ecuador (UTC−5), que es la que vive el equipo: agrupar por
// la hora UTC correría todo cinco horas y las "mejores horas" saldrían de
// madrugada.

export type HoraDeVenta = { hora: number; ordenes: number; facturado: number };

export type RitmoVentas = {
  ordenes: number;
  facturado: number;
  porHora: HoraDeVenta[];
  /** Las tres horas con más pedidos, de mayor a menor. */
  mejores: HoraDeVenta[];
  /** Qué porción de los pedidos entra en esas tres horas. 0 a 1. */
  porcionMejores: number;
  /** Pedidos por hora dentro del período (sobre las horas ya transcurridas). */
  porHoraPromedio: number;
};

async function ritmoDeVentasSinMemoria(organizationId: string, range: Range): Promise<RitmoVentas> {
  const filas = await db.$queryRaw<{ hora: number; ordenes: number; facturado: number }[]>`
    SELECT extract(hour from (o."occurredAt" - interval '5 hours'))::int AS hora,
           count(*)::int AS ordenes,
           coalesce(sum(o."netSales"), 0)::float8 AS facturado
      FROM "ShopifyOrder" o
      JOIN "ShopifyStore" s ON s.id = o."storeId"
     WHERE s."organizationId" = ${organizationId}
       AND o."occurredAt" >= ${range.fromInstant}
       AND o."occurredAt" <= ${range.toInstant}
     GROUP BY 1`;

  const porHora: HoraDeVenta[] = Array.from({ length: 24 }, (_, hora) => ({ hora, ordenes: 0, facturado: 0 }));
  for (const f of filas) {
    porHora[f.hora] = { hora: f.hora, ordenes: f.ordenes, facturado: f.facturado };
  }

  const ordenes = porHora.reduce((s, h) => s + h.ordenes, 0);
  const facturado = porHora.reduce((s, h) => s + h.facturado, 0);
  const mejores = [...porHora].sort((a, b) => b.ordenes - a.ordenes).slice(0, 3).filter((h) => h.ordenes > 0);

  // Las horas que de verdad transcurrieron: con "Hoy" a las 10 de la mañana,
  // dividir entre 24 diría la mitad de lo que se está vendiendo por hora.
  const hasta = Math.min(range.toInstant.getTime(), Date.now());
  const horas = Math.max(1, (hasta - range.fromInstant.getTime()) / 3600_000);

  return {
    ordenes,
    facturado,
    porHora,
    mejores,
    porcionMejores: ordenes > 0 ? mejores.reduce((s, h) => s + h.ordenes, 0) / ordenes : 0,
    porHoraPromedio: ordenes / horas,
  };
}

export const ritmoDeVentas = memorizar("ritmo-ventas.ritmoDeVentas", ritmoDeVentasSinMemoria);
