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

// LA REGLA ES LA DEL TABLERO DE EMILIA, NO UNA PROPIA
// Su tablero «Comercial vs Pauta» (revisado el 18-nov) clasifica cada producto
// con pauta por la confirmación del área comercial (la planilla de ventas:
// confirmados ÷ pedidos) Y por el CPA real (gasto ÷ pedidos del comercial):
//   - ALTO: confirma menos de 65 % o el CPA real pasa de $8. Se separa por
//     causa, porque cada una pide otra solución: mala confirmación (logística
//     o producto), buena confirmación con CPA alto (el anuncio), o las dos.
//   - MEDIO: no llega a 70 % de confirmación, o su CPA pasa de $5, o tiene
//     menos de 30 pedidos (esta regla no se aplica a los testeos), o la
//     plataforma cuenta más de 1,33 veces sus pedidos.
//   - BAJO: cumple todo.
// Los umbrales se pueden mover desde la pantalla (en su tablero, desde la
// pestaña Top 10); estos son los de ella.

export type UmbralesRiesgo = {
  /** Por debajo: riesgo alto. */
  confirmacionAlto: number;
  /** Por encima: riesgo alto. */
  cpaAlto: number;
  /** Por debajo: riesgo medio. */
  confirmacionMedio: number;
  /** Por encima: riesgo medio. */
  cpaMedio: number;
  /** Menos pedidos que esto: riesgo medio (no aplica a testeos). */
  pedidosMinimos: number;
  /** Plataforma ÷ pedidos de Shopify por encima de esto: riesgo medio. */
  factorPlataforma: number;
  /**
   * El factor solo se mira con al menos estos pedidos en Shopify: con 1 o 4
   * pedidos, 8 compras de plataforma dan 8× y no dicen nada. Así lo hace el
   * tablero de Emilia (Ojara 6/4, Fwee 15/7 o Baïa 8/1 no se marcan).
   */
  factorMinimoPedidos: number;
};

export const UMBRALES_RIESGO: UmbralesRiesgo = {
  confirmacionAlto: 0.65,
  cpaAlto: 8,
  confirmacionMedio: 0.7,
  cpaMedio: 5,
  pedidosMinimos: 30,
  factorPlataforma: 1.33,
  factorMinimoPedidos: 10,
};

// Compatibilidad con las pantallas que pintan la confirmación por colores.
export const CONFIRMACION_ALTA = UMBRALES_RIESGO.confirmacionMedio;
export const CONFIRMACION_MEDIA = UMBRALES_RIESGO.confirmacionAlto;
export const CPA_ALERTA = UMBRALES_RIESGO.cpaMedio;

export type Riesgo = "bajo" | "medio" | "alto" | "sinDatos";

/** Por qué un producto de riesgo alto está ahí. */
export type CausaAlto = "confirmacion" | "cpa" | "ambas" | "sinDatos";

export type Motivo = { texto: string; grave: boolean };

export type Clasificacion = { riesgo: Riesgo; causa: CausaAlto | null; motivos: Motivo[] };

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const pctTxt = (n: number) =>
  `${(n * 100).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const usd = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * El riesgo de un producto en el período, con la regla del tablero de Emilia.
 *
 * `pedidos` y `confirmados` son los del área comercial (la planilla); `cpa` es
 * gasto ÷ esos pedidos; `plataforma`, las compras que se atribuyen Meta y
 * TikTok. Un testeo sin pedidos (solo pauta) cae en alto: no hay cómo medirlo.
 */
export function clasificarRiesgo(
  f: {
    pedidos: number;
    confirmados: number;
    cpa: number | null;
    plataforma: number;
    gasto: number;
    testeo?: boolean;
    /** Pedidos de Shopify: la base del factor de plataforma. Sin el dato, los del comercial. */
    shopify?: number | null;
  },
  u: UmbralesRiesgo = UMBRALES_RIESGO,
): Clasificacion {
  const motivos: Motivo[] = [];
  const volumen = (n: number, grave: boolean) => {
    if (!f.testeo && n < u.pedidosMinimos) motivos.push({ texto: `solo ${n} pedidos comercial`, grave });
  };
  if (f.pedidos <= 0) {
    if (f.gasto <= 0 && f.plataforma <= 0) return { riesgo: "sinDatos", causa: null, motivos };
    motivos.push({ texto: "sin dato comercial", grave: true });
    if (f.gasto > 0) motivos.push({ texto: "sin pedidos para medir CPA", grave: true });
    volumen(0, true);
    return { riesgo: "alto", causa: "sinDatos", motivos };
  }
  const conf = r4(f.confirmados / f.pedidos);
  const cpa = f.cpa == null ? null : r4(f.cpa);
  // Plataforma ÷ pedidos de Shopify, como el tablero (Té 18 flavors: 191 ÷ 125
  // = 1,53×). A dos decimales, como se lee: 12 ÷ 9 = 1,333 se ve «1,33×».
  const base = f.shopify ?? f.pedidos;
  const factor = base >= u.factorMinimoPedidos && base > 0 ? Math.round((f.plataforma / base) * 100) / 100 : null;
  const factorAlto = factor != null && factor > u.factorPlataforma;
  const textoFactor = () => `plataforma cuenta ${factor!.toLocaleString("es-EC", { maximumFractionDigits: 2 })}× los pedidos`;

  const confMala = conf < u.confirmacionAlto;
  const cpaMalo = cpa != null && cpa > u.cpaAlto;
  if (confMala || cpaMalo) {
    // En alto se listan todos los umbrales que no cumple, también los de medio
    // (Lifting Pro Duo: «confirma 68,18 %», «CPA real $10,41», «solo 22»).
    if (conf < u.confirmacionMedio) motivos.push({ texto: `confirma ${pctTxt(conf)}`, grave: true });
    if (cpa != null && cpa > u.cpaMedio) motivos.push({ texto: `CPA real ${usd(cpa)}`, grave: true });
    volumen(f.pedidos, true);
    if (factorAlto) motivos.push({ texto: textoFactor(), grave: true });
    return { riesgo: "alto", causa: confMala && cpaMalo ? "ambas" : confMala ? "confirmacion" : "cpa", motivos };
  }

  if (conf < u.confirmacionMedio) motivos.push({ texto: `confirma ${pctTxt(conf)}`, grave: false });
  if (cpa != null && cpa > u.cpaMedio) motivos.push({ texto: `CPA real ${usd(cpa)}`, grave: false });
  volumen(f.pedidos, false);
  if (factorAlto) motivos.push({ texto: textoFactor(), grave: false });
  if (motivos.length > 0) return { riesgo: "medio", causa: null, motivos };
  return { riesgo: "bajo", causa: null, motivos: [{ texto: "cumple todo", grave: false }] };
}

/** Solo la sección, sin los motivos. */
export function riesgoDe(
  f: {
    pedidos: number;
    confirmados: number;
    cpa: number | null;
    plataforma: number;
    gasto: number;
    testeo?: boolean;
    /** Pedidos de Shopify: la base del factor de plataforma. Sin el dato, los del comercial. */
    shopify?: number | null;
  },
  u: UmbralesRiesgo = UMBRALES_RIESGO,
): Riesgo {
  return clasificarRiesgo(f, u).riesgo;
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
