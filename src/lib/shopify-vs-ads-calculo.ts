// Shopify contra las plataformas, y el riesgo de cada producto: las cuentas,
// sin base de datos, para poder probarlas solas (tests/shopify-vs-ads.test.ts).
//
// LO QUE PIDIERON (llamada del 10-nov con Fabrizio y Emilia)
// Meta y TikTok se atribuyen más compras de las que llegan a Shopify —en NIDA
// la plataforma decía CPA 4,56 y el real era 6,75—. Con ese CPA optimista se
// escalan campañas que no lo merecen. Quieren ver, a diario y por producto:
// cuántos pedidos llegan a Shopify, cuántos dice cada plataforma, la
// diferencia, el factor, el CPA de plataforma contra el real, y el objetivo.
//
// EL FACTOR
// Es plataforma ÷ Shopify, igual que en el archivo de Fabrizio: 1,00 es que
// coinciden; 1,30 es que la plataforma reporta un 30% más de compras de las
// que existen. Lo aceptable, dicho por él: menos de un 10% de diferencia.

/** Hasta aquí la diferencia es aceptable (Fabrizio: «debe ser inferior al 10%»). */
export const DIFERENCIA_ACEPTABLE = 0.1;
/** Hasta aquí es para vigilar; más allá hay que revisar el píxel. */
export const DIFERENCIA_ALERTA = 0.25;

export type EstadoCuadre = "bien" | "vigilar" | "mal" | null;

export type Cuadre = {
  shopify: number;
  meta: number;
  tiktok: number;
  plataforma: number;
  /** plataforma − Shopify. Positivo: la plataforma se atribuye de más. */
  diferencia: number;
  /** plataforma ÷ Shopify. null sin pedidos en Shopify. */
  factor: number | null;
  /** factor − 1, en fracción (0,3 = 30% de más). */
  porcentaje: number | null;
  gasto: number;
  /** gasto ÷ compras de plataforma: lo que muestra el administrador de anuncios. */
  cpaPlataforma: number | null;
  /** gasto ÷ pedidos de Shopify: lo que cuesta de verdad cada pedido. */
  cpaReal: number | null;
  estado: EstadoCuadre;
};

export function cuadrar(f: { shopify: number; meta: number; tiktok: number; gasto: number }): Cuadre {
  const plataforma = f.meta + f.tiktok;
  const factor = f.shopify > 0 ? plataforma / f.shopify : null;
  const porcentaje = factor == null ? null : factor - 1;
  return {
    shopify: f.shopify,
    meta: f.meta,
    tiktok: f.tiktok,
    plataforma,
    diferencia: plataforma - f.shopify,
    factor,
    porcentaje,
    gasto: f.gasto,
    cpaPlataforma: plataforma > 0 ? f.gasto / plataforma : null,
    // Sin gasto no hay CPA: un «$0,00» se leería como el mejor producto.
    cpaReal: f.shopify > 0 && f.gasto > 0 ? f.gasto / f.shopify : null,
    // Sin pauta y sin compras de plataforma no hay nada que cuadrar: son
    // ventas orgánicas (recompras), no un píxel roto. Pintarlas de rojo con
    // «factor 0,00» mandaba a revisar algo que está bien.
    estado: f.gasto <= 0 && plataforma <= 0 ? null : estadoDelCuadre(f.shopify, plataforma),
  };
}

/**
 * El color de la fila.
 *
 * Sin pedidos en ninguno de los dos lados no hay nada que juzgar. Con
 * plataforma y sin Shopify es lo peor que puede pasar: compras que no existen.
 */
export function estadoDelCuadre(shopify: number, plataforma: number): EstadoCuadre {
  if (shopify <= 0 && plataforma <= 0) return null;
  if (shopify <= 0) return "mal";
  // Se redondea a 4 decimales: 110 ÷ 100 − 1 da 0,1000000000000001 y sacaba
  // del verde a un 10% exacto.
  const desvio = Math.round(Math.abs(plataforma / shopify - 1) * 1e4) / 1e4;
  if (desvio <= DIFERENCIA_ACEPTABLE) return "bien";
  if (desvio <= DIFERENCIA_ALERTA) return "vigilar";
  return "mal";
}

// ─── Riesgo ──────────────────────────────────────────────────────────────

// LA REGLA ES LA DEL ARCHIVO DE EMILIA, NO UNA PROPIA
// Su artefacto «Confirmación y CPA por producto» (mostrado el 10-nov y
// revisado el 16-nov) clasifica SOLO por la confirmación que mide la planilla
// de ventas en el período —confirmados ÷ pedidos—: 70% o más es riesgo bajo,
// de 57% a 69,99% medio, menos de 57% alto. El CPA no mueve de sección: se
// pinta de rojo cuando pasa de $6. Antes Jarvis mezclaba la confirmación de la
// Calculadora con el CPA objetivo, y el drenaje (71% de confirmación) caía en
// «medio» por un objetivo de $2,67 mal cargado: la misma lista daba otra
// respuesta que la de ellos, que es la que usan para decidir.

/** Emilia: «los que tienen alta confirmación, del 70% para arriba». */
export const CONFIRMACION_ALTA = 0.7;
/** Desde aquí y hasta el 70% es riesgo medio; por debajo, alto. */
export const CONFIRMACION_MEDIA = 0.57;
/** El CPA real que se pinta de rojo, como en el archivo de Emilia. */
export const CPA_ALERTA = 6;

export type Riesgo = "bajo" | "medio" | "alto" | "sinDatos";

/**
 * El riesgo de un producto en el período, por su confirmación real.
 * Sin pedidos en la planilla no hay confirmación que medir.
 */
export function riesgoDe(f: { pedidos: number; confirmacion: number | null }): Riesgo {
  if (f.pedidos <= 0 || f.confirmacion == null) return "sinDatos";
  // Redondeado a 4 decimales: 0,57 calculado como 57/100 no debe caer en alto.
  const c = Math.round(f.confirmacion * 1e4) / 1e4;
  if (c >= CONFIRMACION_ALTA) return "bajo";
  if (c >= CONFIRMACION_MEDIA) return "medio";
  return "alto";
}

/** CPA real de la pantalla de riesgo: gasto ÷ pedidos de la planilla. Sin gasto no hay CPA. */
export function cpaDePlanilla(gasto: number, pedidos: number): number | null {
  return gasto > 0 && pedidos > 0 ? gasto / pedidos : null;
}

/** El top del mes: los que más utilidad dejaron, con al menos un pedido. */
export function topDelMes<T extends { utilidad: number; pedidos: number }>(filas: T[], n = 10): T[] {
  return filas
    .filter((f) => f.pedidos > 0)
    .sort((a, b) => b.utilidad - a.utilidad)
    .slice(0, n);
}
