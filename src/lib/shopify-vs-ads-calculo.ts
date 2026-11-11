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

/** Emilia: «los que tienen alta confirmación, del 70% para arriba». */
export const CONFIRMACION_ALTA = 0.7;
/** Por debajo de esto la confirmación ya es un problema por sí sola. */
export const CONFIRMACION_BAJA = 0.55;

export type Riesgo = "bajo" | "medio" | "alto" | "sinDatos";

/**
 * El riesgo de un producto en el período.
 *
 * - Bajo: confirma 70% o más y su CPA real está dentro del objetivo. Es el
 *   ejemplo que dieron: las gotas de drenaje, buena confirmación y buen CPA.
 * - Alto: confirma poco Y el CPA se pasa del objetivo, o directamente pierde
 *   plata.
 * - Medio: todo lo demás, una de las dos cosas anda bien y la otra no.
 *
 * Sin CPA objetivo cargado se juzga el CPA por la utilidad: si gana, el CPA
 * está aguantando.
 */
export function riesgoDe(f: {
  pedidos: number;
  efectividad: number;
  cpaReal: number | null;
  cpaObjetivo: number | null;
  utilidad: number;
}): Riesgo {
  if (f.pedidos <= 0) return "sinDatos";
  const confirmaBien = f.efectividad >= CONFIRMACION_ALTA;
  const confirmaMal = f.efectividad < CONFIRMACION_BAJA;
  const cpaBien =
    f.cpaObjetivo != null && f.cpaObjetivo > 0 && f.cpaReal != null
      ? f.cpaReal <= f.cpaObjetivo
      : f.utilidad > 0;
  if (f.utilidad < 0 && !confirmaBien) return "alto";
  if (confirmaBien && cpaBien) return "bajo";
  if (confirmaMal && !cpaBien) return "alto";
  return "medio";
}

/** El top del mes: los que más utilidad dejaron, con al menos un pedido. */
export function topDelMes<T extends { utilidad: number; pedidos: number }>(filas: T[], n = 10): T[] {
  return filas
    .filter((f) => f.pedidos > 0)
    .sort((a, b) => b.utilidad - a.utilidad)
    .slice(0, n);
}
