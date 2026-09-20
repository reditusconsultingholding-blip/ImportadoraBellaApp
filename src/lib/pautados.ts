import { db } from "@/lib/db";
import { memorizar } from "@/lib/memoria";

// Qué productos se están pautando.
//
// El catálogo tiene más de cien productos y casi ninguno está vivo al mismo
// tiempo: en un mes cualquiera se pautan veinte o treinta. Las pantallas que
// listaban el catálogo entero obligaban a buscar entre productos que nadie
// toca hace meses —"es que salen todos los productos y toca bajar y bajar"—.
//
// La cuenta ya está en la base: un producto pautado es uno que tuvo gasto en
// alguna de sus campañas dentro del período. No hay que marcarlo a mano ni
// mantener una lista aparte, y el día que se deje de pautar desaparece solo.

async function productosPautadosSinMemoria(
  organizationId: string,
  desde: Date,
  hasta: Date,
): Promise<string[]> {
  const filas = await db.$queryRaw<{ productId: string }[]>`
    SELECT DISTINCT c."productId"
      FROM "MetricSnapshot" m
      JOIN "Campaign" c ON c.id = m."campaignId"
      JOIN "AdAccount" a ON a.id = c."adAccountId"
     WHERE a."organizationId" = ${organizationId}
       AND c."productId" IS NOT NULL
       AND m.spend > 0
       AND m."capturedAt" >= ${desde}
       AND m."capturedAt" < ${hasta}`;
  return filas.map((f) => f.productId);
}

/** Los productos con gasto publicitario entre dos fechas. */
export const productosPautados = memorizar("pautados.productosPautados", productosPautadosSinMemoria);

/** Los pautados en los últimos `dias` días, que es el "ahora mismo" del equipo. */
export function productosPautadosRecientes(organizationId: string, dias = 30) {
  const hasta = new Date();
  hasta.setUTCHours(0, 0, 0, 0);
  hasta.setUTCDate(hasta.getUTCDate() + 1);
  const desde = new Date(hasta.getTime() - dias * 86400_000);
  return productosPautados(organizationId, desde, hasta);
}

/** Los pautados en un mes calendario. */
export function productosPautadosDelMes(organizationId: string, anio: number, mes: number) {
  return productosPautados(
    organizationId,
    new Date(Date.UTC(anio, mes - 1, 1)),
    new Date(Date.UTC(anio, mes, 1)),
  );
}
