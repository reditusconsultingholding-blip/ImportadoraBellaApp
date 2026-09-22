import { db } from "@/lib/db";
import { pedidosRealesPorDia, type PedidosDelDia } from "@/lib/pedidos-reales";

// De dónde salen los pedidos del control publicitario.
//
// Hay dos fuentes y no son la misma cosa:
//
//   - LA PLANILLA DEL EQUIPO DE VENTAS. Es la buena. Es la que Emilia mira, la
//     que el equipo discute y contra la que se compara todo. Entra por
//     `integrations/reporte-ventas.ts` una vez por hora.
//
//   - SHOPIFY. Se le acerca —en agosto daba 11.804 contra 11.753— pero cuenta
//     otra cosa: los pedidos de Funnelish no están, y los estados no son los
//     del equipo.
//
// LA REGLA: manda la planilla, día por día. Si un día tiene pedidos cargados
// en el reporte, el control usa ESOS y no mezcla. Si no lo tiene —un mes que
// la planilla ya no cubre, o el día de hoy antes de que lo carguen— se usa
// Shopify, que es mejor que una fila vacía.
//
// Mezclar las dos fuentes dentro de un mismo día sería lo peor de los dos
// mundos: un número que no coincide con ninguna de las dos planillas y que
// nadie puede reproducir a mano.

/** Un día a medianoche UTC, a partir de un instante real de Ecuador. */
function diaDeInstante(instante: Date) {
  const local = new Date(instante.getTime() - 5 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

export type PedidosDelControl = PedidosDelDia & {
  /** De dónde salió este día. Va hasta la pantalla: el número tiene que poder rastrearse. */
  fuente: "reporte" | "shopify";
};

/**
 * Los pedidos de cada día entre dos instantes, con la planilla mandando.
 *
 * Los nombres del reporte se cruzan con la misma tabla de enlaces que usan los
 * de Shopify (`ProductoShopify`), así que enlazar un nombre una vez sirve para
 * las dos fuentes. Lo que no está enlazado cuenta igual, en "sin asignar": el
 * pedido existió aunque todavía no sepamos de qué producto es.
 */
export async function pedidosParaElControl(
  organizationId: string,
  desde: Date,
  hasta: Date,
): Promise<PedidosDelControl[]> {
  const desdeDia = diaDeInstante(desde);
  const hastaDia = diaDeInstante(new Date(hasta.getTime() - 1));

  const [deShopify, delReporte, enlaces, excluidos] = await Promise.all([
    pedidosRealesPorDia(organizationId, desde, hasta),
    db.pedidoReporte.findMany({
      where: { organizationId, fecha: { gte: desdeDia, lte: hastaDia } },
      select: { fecha: true, productoNorm: true, pedidos: true },
    }),
    db.productoShopify.findMany({
      where: { organizationId },
      select: { nombreNorm: true, productId: true },
    }),
    db.nombreShopifyExcluido.findMany({
      where: { organizationId },
      select: { nombreNorm: true, motivo: true },
    }),
  ]);

  if (delReporte.length === 0) {
    return deShopify.map((d) => ({ ...d, fuente: "shopify" as const }));
  }

  const aProducto = new Map(enlaces.map((e) => [e.nombreNorm, e.productId]));
  const fuera = new Map(excluidos.map((e) => [e.nombreNorm, e.motivo]));

  const porDia = new Map<string, PedidosDelControl>();
  for (const fila of delReporte) {
    const clave = fila.fecha.toISOString();
    const dia = porDia.get(clave) ?? {
      fecha: fila.fecha,
      porProducto: new Map<string, number>(),
      sinAsignar: 0,
      testeo: 0,
      fuente: "reporte" as const,
    };

    const productId = aProducto.get(fila.productoNorm);
    const motivo = fuera.get(fila.productoNorm);
    if (productId) {
      dia.porProducto.set(productId, (dia.porProducto.get(productId) ?? 0) + fila.pedidos);
    } else if (motivo === "testeo") {
      // Los de testeo existen pero no se suman: el equipo los llama
      // "netamente un gasto".
      dia.testeo += fila.pedidos;
    } else {
      dia.sinAsignar += fila.pedidos;
    }
    porDia.set(clave, dia);
  }

  // Los días que la planilla no cubre se completan con Shopify, sin mezclar.
  for (const d of deShopify) {
    const clave = d.fecha.toISOString();
    if (!porDia.has(clave)) porDia.set(clave, { ...d, fuente: "shopify" });
  }

  return [...porDia.values()].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
}

/**
 * Qué días del período salen de la planilla y cuáles de Shopify.
 *
 * Es para poder decirlo en pantalla. Un número que cambia de origen sin avisar
 * es exactamente lo que hizo que nadie confiara en el control.
 */
export async function coberturaDelReporte(organizationId: string, desdeDia: Date, hastaDia: Date) {
  const filas = await db.pedidoReporte.groupBy({
    by: ["fecha"],
    where: { organizationId, fecha: { gte: desdeDia, lte: hastaDia } },
    _sum: { pedidos: true },
  });
  const dias = filas.length;
  const pedidos = filas.reduce((a, f) => a + (f._sum.pedidos ?? 0), 0);
  const ultimo = filas.length
    ? new Date(Math.max(...filas.map((f) => f.fecha.getTime())))
    : null;
  return { dias, pedidos, ultimoDia: ultimo };
}
