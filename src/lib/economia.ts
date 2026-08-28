// La economía de un producto en contraentrega.
//
// Es la fórmula que el equipo ya usa en su planilla, y la misma que la
// calculadora de la app: de cada checkout que paga la pauta, solo una parte se
// confirma, y de esa parte una porción se devuelve. Lo que de verdad se cobra
// es `entregados = efectividad × (1 − devoluciones)`, y todo cuelga de ahí.
//
// Sin esto, "rentabilidad" es el precio menos el costo — un número que en este
// negocio no describe nada: un producto con 100% de margen bruto y 20% de
// efectividad pierde plata en cada venta.

export type Economia = {
  /** Precio de venta promedio. */
  precio: number;
  /** Costo del producto. */
  costo: number;
  /** Costo de envío por paquete DESPACHADO (se paga aunque vuelva). */
  flete: number;
  /** 0-1: qué porción de los checkouts se confirma. */
  efectividad: number;
  /** 0-1: qué porción de lo despachado vuelve. */
  devoluciones: number;
  /** Gasto administrativo repartido por pedido entregado. */
  gastoAdm: number;
};

export type Cuentas = {
  /** Cuántas ventas cobradas deja cada checkout. */
  entregados: number;
  /**
   * Lo máximo que se puede pagar por checkout sin perder plata. Es el umbral
   * contra el que hay que comparar el CPA real.
   */
  cpaBreakeven: number;
  /** El objetivo con colchón, que es lo que conviene usar como meta. */
  cpaObjetivo: number;
  /** Lo que deja cada checkout con el CPA que se está pagando hoy. */
  contribucion: number | null;
  /** Lo que de verdad cuesta UNA venta cobrada. */
  cpaEfectivo: number | null;
};

/**
 * Cuánto colchón se deja sobre el punto de equilibrio.
 *
 * 30% no es un número mágico: es lo que separa "no pierdo plata" de "gano
 * algo". Apuntar al breakeven exacto significa trabajar gratis y quedar en
 * rojo con cualquier variación de la efectividad.
 */
const COLCHON = 0.7;

export function calcular(e: Economia, cpaActual: number | null): Cuentas {
  const entregados = Math.max(0, Math.min(1, e.efectividad)) * (1 - Math.max(0, Math.min(1, e.devoluciones)));

  // El flete se paga sobre TODO lo despachado —confirmado, se devuelva o no—,
  // así que va multiplicado por la efectividad y no por los entregados. Es el
  // error más caro de esta cuenta: subestima el costo de un producto con
  // muchas devoluciones.
  const cpaBreakeven =
    e.precio * entregados - e.costo * entregados - e.flete * e.efectividad - e.gastoAdm * entregados;

  return {
    entregados,
    cpaBreakeven,
    cpaObjetivo: cpaBreakeven * COLCHON,
    contribucion: cpaActual == null ? null : cpaBreakeven - cpaActual,
    cpaEfectivo: cpaActual == null || entregados <= 0 ? null : cpaActual / entregados,
  };
}

/** Si un producto tiene cargada su economía real o todavía se está estimando. */
export function tieneEconomiaReal(p: {
  salePrice: number | null;
  unitCost: number | null;
  efectividad: number | null;
  flete: number | null;
}) {
  return (
    p.salePrice != null &&
    p.salePrice > 0 &&
    p.unitCost != null &&
    p.efectividad != null &&
    p.efectividad > 0 &&
    p.flete != null
  );
}

/** Arma la economía de un producto, completando lo que falte con supuestos. */
export function economiaDe(p: {
  salePrice: number | null;
  unitCost: number | null;
  efectividad: number | null;
  devoluciones: number | null;
  flete: number | null;
  gastoAdmPorPedido: number | null;
}): Economia | null {
  if (p.salePrice == null || p.salePrice <= 0 || p.unitCost == null) return null;
  return {
    precio: p.salePrice,
    costo: p.unitCost,
    flete: p.flete ?? 0,
    // Sin efectividad cargada se asume que todo se entrega. Es optimista, y por
    // eso los productos sin economía real quedan marcados como provisionales:
    // el umbral que sale de acá es el techo, no la realidad.
    efectividad: p.efectividad ?? 1,
    devoluciones: p.devoluciones ?? 0,
    gastoAdm: p.gastoAdmPorPedido ?? 0,
  };
}
