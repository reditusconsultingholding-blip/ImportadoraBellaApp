import { db } from "@/lib/db";
import { normalizar } from "@/lib/product-code";
import { separarClave } from "@/lib/clave-calculadora";

/**
 * La economía de cada producto, tomada de la Calculadora de precios.
 *
 * Emilia lo pidió así: "que la información desde calculadora me jale para saber
 * la rentabilidad del control publicitario, ya que aquí nosotros podemos ir
 * modificando al rato y todo eso, que sea automático".
 *
 * EL PROBLEMA QUE RESUELVE. La economía del mes se cargaba a mano, con un
 * archivo que pasa administración. Ese archivo llega tarde —el 13 de octubre
 * todavía iba hasta septiembre— así que octubre se calculaba con la ficha del
 * producto, que es un solo juego de números para toda la historia y está vieja.
 * De ahí salía el "en todo estamos perdiendo y eso no es así": una utilidad
 * calculada con costos de hace meses contra el gasto de pauta de hoy.
 *
 * La calculadora, en cambio, la mantienen al día: hay productos editados esta
 * misma mañana. Es el dato más fresco que existe en la casa.
 */

export type EconomiaCalculada = {
  efectividad: number;
  produccion: number;
  flete: number;
  precioProm: number;
  cpaMin: number | null;
  devoluciones: number | null;
  /**
   * El gasto operativo POR PEDIDO que se tecleó en la Calculadora, o null si
   * no se cargó. Fabrizio, 10-nov: «podemos sacar el gasto operativo de la
   * calculadora, porque ahí está incluido; está por pedido, allá se debería
   * hacer la multiplicación». Opcional para no romper a quien arma una a mano.
   */
  gastoOperativo?: number | null;
  /**
   * El «CPA objetivo» que muestra la Calculadora para ese producto: el CPA de
   * equilibrio menos el margen que se quiere ganar. Es el «objetivo» de
   * Shopify vs Ads y de Riesgo (Emilia, 23-nov: «lo que es objetivo, ¿de dónde
   * sale? De calculadora, ¿no?»). Null si falta la confirmación.
   */
  cpaObjetivo?: number | null;
};

/**
 * El CPA objetivo, con la misma cuenta que `computeOperation` de la
 * Calculadora en pantalla: lo que deja un checkout antes de la pauta (precio
 * neto de IVA y pasarela, menos producto y gasto operativo sobre lo entregado,
 * menos el flete sobre lo despachado) y, en modo margen, menos ese margen
 * sobre lo entregado.
 */
export function cpaObjetivoCalculadora(e: {
  precio: number;
  produccion: number;
  flete: number;
  admin: number;
  confirmacion: number;
  devoluciones: number;
  iva?: number;
  pasarela?: number;
  margen?: number;
}): number {
  const entregados = e.confirmacion * (1 - e.devoluciones);
  const neto = e.precio / (1 + (e.iva ?? 0)) - e.precio * (e.pasarela ?? 0);
  const equilibrio = neto * entregados - e.produccion * entregados - e.flete * e.confirmacion - e.admin * entregados;
  return Math.round((equilibrio - (e.margen ?? 0) * e.precio * entregados) * 100) / 100;
}

/**
 * Un número escrito por una persona.
 *
 * La calculadora guarda lo que se tecleó, tal cual, y en Ecuador se escribe con
 * coma: "5,61". `Number("5,61")` es NaN, así que sin esto el flete de medio
 * catálogo entraba como cero y la utilidad salía inflada — que es justo el tipo
 * de error que nadie nota.
 */
function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const limpio = v.trim().replace(/\s/g, "").replace(",", ".");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/**
 * El CPA máximo que admite un producto: lo que deja cada pedido confirmado
 * antes de pagar la pauta.
 *
 * Es la misma cuenta que hace la calculadora en pantalla
 * (`(neto − producto − adm) × (1 − devoluciones) − flete`), repetida acá para
 * que el control no dependa de que alguien abra esa pantalla. Si da negativo no
 * se devuelve: un "CPA máximo" bajo cero no es un tope, es un producto que
 * pierde con cualquier pauta, y mostrarlo como tope confunde.
 */
export function cpaMaximo(e: {
  precioProm: number;
  produccion: number;
  admin: number;
  flete: number;
  devoluciones: number | null;
}): number | null {
  const dev = e.devoluciones ?? 0;
  const porConfirmado = (e.precioProm - e.produccion - e.admin) * (1 - dev) - e.flete;
  return porConfirmado > 0 ? Math.round(porConfirmado * 100) / 100 : null;
}

/**
 * Lo que la calculadora sabe hoy, por id de producto. Con `mes` ("2026-11"),
 * solo los ajustes guardados para ese mes; sin él, el histórico.
 */
export async function economiaDeLaCalculadora(
  organizationId: string,
  mes: string | null = null,
): Promise<Map<string, EconomiaCalculada>> {
  const [ajustes, productos] = await Promise.all([
    db.calcSetting.findMany({
      where: { organizationId },
      select: { producto: true, data: true },
    }),
    db.product.findMany({
      where: { organizationId },
      select: { id: true, name: true },
    }),
  ]);

  // La calculadora guarda por NOMBRE de producto, no por id: se cruza por el
  // nombre normalizado, igual que el resto de la app.
  const porNombre = new Map(productos.map((p) => [normalizar(p.name), p.id]));
  const salida = new Map<string, EconomiaCalculada>();

  for (const a of ajustes) {
    const clave = separarClave(a.producto);
    if (clave.mes !== mes) continue;
    const productId = porNombre.get(normalizar(clave.producto));
    if (!productId) continue;

    let d: Record<string, unknown>;
    try {
      d = JSON.parse(a.data) as Record<string, unknown>;
    } catch {
      continue;
    }

    const precio = numero(d.priceOverride);
    const produccion = numero(d.productCost);
    const flete = numero(d.shippingCost);
    const admin = numero(d.operatingCost) ?? 0;
    const conf = numero(d.confirmationPct);
    const dev = numero(d.returnPct);

    // Sin precio ni costo no hay economía que valga: se deja que siga mandando
    // lo que había. Media ficha es peor que ninguna, porque se lee completa.
    if (precio == null || produccion == null) continue;

    const devoluciones = dev == null ? null : dev / 100;

    salida.set(productId, {
      efectividad: conf == null ? 0 : conf / 100,
      produccion,
      flete: flete ?? 0,
      precioProm: precio,
      cpaMin: cpaMaximo({
        precioProm: precio,
        produccion,
        admin,
        flete: flete ?? 0,
        devoluciones,
      }),
      devoluciones,
      gastoOperativo: numero(d.operatingCost) ?? null,
      cpaObjetivo: objetivoDeAjuste(d),
    });
  }

  return salida;
}

/**
 * El CPA objetivo de un ajuste guardado de la Calculadora (su JSON ya leído),
 * o null si le falta precio, costo o confirmación.
 */
export function objetivoDeAjuste(d: Record<string, unknown>): number | null {
  const precio = numero(d.priceOverride);
  const produccion = numero(d.productCost);
  const conf = numero(d.confirmationPct);
  if (precio == null || produccion == null || conf == null || conf <= 0) return null;
  return cpaObjetivoCalculadora({
    precio,
    produccion,
    flete: numero(d.shippingCost) ?? 0,
    admin: numero(d.operatingCost) ?? 0,
    confirmacion: conf / 100,
    devoluciones: (numero(d.returnPct) ?? 0) / 100,
    iva: (numero(d.ivaPct) ?? 0) / 100,
    pasarela: (numero(d.gatewayFeePct) ?? 0) / 100,
    margen: d.mode === "margin" ? (numero(d.marginPct) ?? 0) / 100 : 0,
  });
}

/**
 * El CPA objetivo de cada producto para un período: el de la Calculadora para
 * ese mes si se guardó uno, si no el histórico de la Calculadora. `mes` null
 * (un rango que cruza meses) usa solo el histórico.
 */
export async function objetivosDeLaCalculadora(
  organizationId: string,
  mes: string | null,
): Promise<Map<string, number>> {
  const [historico, delMes] = await Promise.all([
    economiaDeLaCalculadora(organizationId),
    mes ? economiaDeLaCalculadora(organizationId, mes) : Promise.resolve(new Map<string, EconomiaCalculada>()),
  ]);
  const salida = new Map<string, number>();
  for (const capa of [historico, delMes]) {
    for (const [id, e] of capa) if (e.cpaObjetivo != null) salida.set(id, e.cpaObjetivo);
  }
  return salida;
}

/**
 * El objetivo que se muestra: el de la Calculadora; si el producto no está en
 * la Calculadora, el de la planilla de administración (`economiaDe` lleno).
 * El que se puso solo al crear la ficha desde las campañas es provisional y no
 * se muestra: el $2,67 de Gotas de drenaje que Emilia no sabía de dónde salía.
 */
export function objetivoAMostrar(
  p: { id: string; cpaTarget: number; economiaDe: string | null },
  deLaCalculadora: Map<string, number>,
): number | null {
  const calc = deLaCalculadora.get(p.id);
  if (calc != null) return calc;
  return p.economiaDe && p.cpaTarget > 0 ? p.cpaTarget : null;
}
