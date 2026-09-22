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
  /**
   * De dónde salió el nombre.
   *
   * Desde que el control se rige por la planilla del equipo de ventas hay dos
   * vocabularios sin enlazar, no uno: el de Shopify y el que el equipo escribe
   * a mano. Los de la planilla son los que mueven los números del control, así
   * que conviene que se vea cuál es cuál.
   */
  fuente: "shopify" | "reporte" | "ambas";
  /** La mejor sugerencia del emparejador, si hay una. Nunca se aplica sola. */
  sugerido: { id: string; name: string; code: string } | null;
};

async function nombresSinEnlazarSinMemoria(
  organizationId: string,
  desde: Date,
  hasta: Date,
): Promise<NombrePendiente[]> {
  const [nombres, delReporte, enlaces, excluidos, productos] = await Promise.all([
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
    // Los nombres de la planilla del equipo, con sus pedidos del período.
    // Van por la misma tabla de enlaces: enlazar un nombre una vez vale para
    // las dos fuentes.
    db.pedidoReporte.groupBy({
      by: ["productoTexto", "productoNorm"],
      where: { organizationId, fecha: { gte: desde, lte: hasta } },
      _sum: { pedidos: true },
    }),
    db.productoShopify.findMany({ where: { organizationId }, select: { nombreNorm: true } }),
    db.nombreShopifyExcluido.findMany({ where: { organizationId }, select: { nombreNorm: true } }),
    db.product.findMany({
      where: { organizationId, archived: false },
      select: { id: true, name: true, code: true },
    }),
  ]);

  const resueltos = new Set([...enlaces, ...excluidos].map((x) => x.nombreNorm));

  // Las dos fuentes se juntan por nombre normalizado antes de filtrar: el
  // mismo producto escrito distinto en cada lado es UN nombre por resolver,
  // no dos, y sus pedidos se suman para poder ordenar por lo que importa.
  const juntos = new Map<
    string,
    { nombre: string; pedidos: number; facturado: number; fuente: NombrePendiente["fuente"] }
  >();
  for (const n of nombres) {
    const norm = normalizarNombre(n.nombre);
    juntos.set(norm, {
      nombre: n.nombre,
      pedidos: Number(n.pedidos) || 0,
      facturado: Number(n.facturado) || 0,
      fuente: "shopify",
    });
  }
  for (const r of delReporte) {
    const previo = juntos.get(r.productoNorm);
    juntos.set(r.productoNorm, {
      // Se muestra el nombre de la planilla: es el que el equipo reconoce.
      nombre: r.productoTexto,
      pedidos: (previo?.pedidos ?? 0) + (r._sum.pedidos ?? 0),
      facturado: previo?.facturado ?? 0,
      fuente: previo ? "ambas" : "reporte",
    });
  }

  const salida: NombrePendiente[] = [];
  for (const [norm, n] of juntos) {
    if (resueltos.has(norm)) continue;
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
      pedidos: n.pedidos,
      facturado: n.facturado,
      fuente: n.fuente,
      sugerido: claro ? { id: g.p.id, name: g.p.name, code: g.p.code } : null,
    });
  }
  return salida.sort((a, b) => b.pedidos - a.pedidos);
}

// Cálculos pesados compartidos hasta la próxima escritura en la base.
// Ver src/lib/memoria.ts.
export const nombresSinEnlazar = memorizar("enlazar-pedidos.nombresSinEnlazar", nombresSinEnlazarSinMemoria);
