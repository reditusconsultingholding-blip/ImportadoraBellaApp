import { db } from "@/lib/db";
import { normalizarNombre } from "@/lib/enlace-shopify";
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

  const [deShopify, delReporte, enlaces, productos] = await Promise.all([
    pedidosRealesPorDia(organizationId, desde, hasta),
    db.pedidoReporte.findMany({
      where: { organizationId, fecha: { gte: desdeDia, lte: hastaDia } },
      select: { fecha: true, productoNorm: true, pedidos: true },
    }),
    db.productoShopify.findMany({
      where: { organizationId },
      select: { nombreNorm: true, productId: true },
    }),
    // El equipo suele escribir en la planilla el mismo nombre que tiene el
    // producto acá —"COMBO BUCAL", "FAJA LIPO 360"—. Cuando coincide exacto no
    // hace falta que nadie lo enlace a mano. Es una coincidencia EXACTA y no
    // un parecido: proponer parecidos es tarea de la pantalla de enlazar, que
    // los muestra para que una persona decida. Meter un parecido acá sería
    // sumarle a un producto los pedidos de otro sin que nadie se entere.
    db.product.findMany({
      where: { organizationId },
      select: { id: true, name: true, code: true },
    }),
  ]);

  if (delReporte.length === 0) {
    return deShopify.map((d) => ({ ...d, fuente: "shopify" as const }));
  }

  const aProducto = new Map<string, string>();
  for (const p of productos) {
    const porNombre = normalizarNombre(p.name);
    if (porNombre) aProducto.set(porNombre, p.id);
    const porCodigo = normalizarNombre(p.code);
    if (porCodigo) aProducto.set(porCodigo, p.id);
  }
  // Los enlaces hechos a mano van ÚLTIMOS: si alguien dijo que este nombre es
  // de este producto, eso gana sobre cualquier coincidencia automática.
  for (const e of enlaces) aProducto.set(e.nombreNorm, e.productId);

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
    if (productId) {
      dia.porProducto.set(productId, (dia.porProducto.get(productId) ?? 0) + fila.pedidos);
    } else {
      // TODO lo que está en la planilla cuenta, incluido lo marcado como
      // testeo o como "no es un producto".
      //
      // Con Shopify esas marcas restaban del total, y tenía sentido: ahí un
      // "pedido" podía ser un envío prioritario suelto. Acá no. El total del
      // control tiene que dar EXACTO lo que el equipo lee en su planilla —es
      // la única razón por la que se cambió de fuente— y restar por una marca
      // que alguien puso en otra pantalla rompe justamente eso. Emilia además
      // marcó un producto como testeo sin querer y eso le movía el mes entero.
      //
      // La marca sigue sirviendo para lo suyo: decir que ese nombre no es un
      // producto que haya que enlazar.
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
  const [filas, porNombre, enlaces, excluidos, productos] = await Promise.all([
    db.pedidoReporte.groupBy({
      by: ["fecha"],
      where: { organizationId, fecha: { gte: desdeDia, lte: hastaDia } },
      _sum: { pedidos: true },
    }),
    db.pedidoReporte.groupBy({
      by: ["productoNorm"],
      where: { organizationId, fecha: { gte: desdeDia, lte: hastaDia } },
      _sum: { pedidos: true },
    }),
    db.productoShopify.findMany({ where: { organizationId }, select: { nombreNorm: true } }),
    db.nombreShopifyExcluido.findMany({ where: { organizationId }, select: { nombreNorm: true } }),
    db.product.findMany({ where: { organizationId }, select: { name: true, code: true } }),
  ]);

  const dias = filas.length;
  const pedidos = filas.reduce((a, f) => a + (f._sum.pedidos ?? 0), 0);
  const ultimo = filas.length ? new Date(Math.max(...filas.map((f) => f.fecha.getTime()))) : null;

  // Cuántos pedidos de la planilla todavía no caen en ningún producto. Es el
  // número que decide si el control sirve: van a la fila "sin asignar", sin
  // ingresos ni costos, y la utilidad del período sale más baja de lo real.
  const conocidos = new Set<string>();
  for (const e of enlaces) conocidos.add(e.nombreNorm);
  for (const e of excluidos) conocidos.add(e.nombreNorm);
  for (const p of productos) {
    conocidos.add(normalizarNombre(p.name));
    conocidos.add(normalizarNombre(p.code));
  }
  let sinProducto = 0;
  let nombresSinProducto = 0;
  for (const n of porNombre) {
    if (conocidos.has(n.productoNorm)) continue;
    sinProducto += n._sum.pedidos ?? 0;
    nombresSinProducto += 1;
  }

  return { dias, pedidos, ultimoDia: ultimo, sinProducto, nombresSinProducto };
}
