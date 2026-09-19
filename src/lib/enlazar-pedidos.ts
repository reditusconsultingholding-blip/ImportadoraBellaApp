import { db } from "@/lib/db";
import { comparar, normalizarNombre } from "@/lib/enlace-shopify";
import { memorizar } from "@/lib/memoria";

// Lo que falta enlazar para que los pedidos reales caigan en su producto.
//
// Cada nombre de línea de pedido de Shopify tiene que terminar en uno de tres
// lugares: un producto, "no es un producto" (envío prioritario, garantías) o
// "testeo". Mientras no esté en ninguno, sus pedidos cuentan en el total pero
// van a la fila "sin producto asignado", sin ingresos ni costos, y la utilidad
// del período sale más baja de lo real.
//
// Se ordena por pedidos del período: enlazar el nombre que trajo dos mil
// pedidos en julio cambia el número del mes; enlazar el que trajo tres, no.

export type NombrePendiente = {
  nombre: string;
  pedidos: number;
  facturado: number;
  /** La mejor sugerencia del emparejador, si hay una. Nunca se aplica sola. */
  sugerido: { id: string; name: string; code: string } | null;
};

async function nombresSinEnlazarSinMemoria(
  organizationId: string,
  desde: Date,
  hasta: Date,
): Promise<NombrePendiente[]> {
  const [nombres, enlaces, excluidos, productos] = await Promise.all([
    db.$queryRaw<{ nombre: string; pedidos: number; facturado: number }[]>`
      SELECT li."productName"                    AS nombre,
             count(DISTINCT li."orderId")::int   AS pedidos,
             coalesce(sum(li.amount), 0)::float8 AS facturado
        FROM "ShopifyOrderLineItem" li
        JOIN "ShopifyOrder" o ON o.id = li."orderId"
        JOIN "ShopifyStore" s ON s.id = o."storeId"
       WHERE s."organizationId" = ${organizationId}
         AND o."occurredAt" >= ${new Date(desde.getTime() + 5 * 3600_000)}
         AND o."occurredAt" <  ${new Date(hasta.getTime() + 29 * 3600_000)}
       GROUP BY 1
       ORDER BY 2 DESC`,
    db.productoShopify.findMany({ where: { organizationId }, select: { nombreNorm: true } }),
    db.nombreShopifyExcluido.findMany({ where: { organizationId }, select: { nombreNorm: true } }),
    db.product.findMany({
      where: { organizationId, archived: false },
      select: { id: true, name: true, code: true },
    }),
  ]);

  const resueltos = new Set([...enlaces, ...excluidos].map((x) => x.nombreNorm));

  const salida: NombrePendiente[] = [];
  for (const n of nombres) {
    if (resueltos.has(normalizarNombre(n.nombre))) continue;
    // La sugerencia solo si es clara: con un empate, mostrar una es empujar a
    // aceptar sin mirar.
    const candidatos = productos
      .map((p) => ({ p, ...comparar(n.nombre, p.name) }))
      .filter((c) => c.base >= 0.5)
      .sort((a, b) => b.base - a.base || b.solape - a.solape);
    const [g, s] = candidatos;
    const claro = g && (!s || g.base > s.base || g.solape - s.solape >= 0.15);
    salida.push({
      nombre: n.nombre,
      pedidos: Number(n.pedidos) || 0,
      facturado: Number(n.facturado) || 0,
      sugerido: claro ? { id: g.p.id, name: g.p.name, code: g.p.code } : null,
    });
  }
  return salida;
}

// Cálculos pesados compartidos hasta la próxima escritura en la base.
// Ver src/lib/memoria.ts.
export const nombresSinEnlazar = memorizar("enlazar-pedidos.nombresSinEnlazar", nombresSinEnlazarSinMemoria);
