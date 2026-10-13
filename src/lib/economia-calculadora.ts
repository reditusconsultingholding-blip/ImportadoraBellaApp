import { db } from "@/lib/db";
import { normalizar } from "@/lib/product-code";

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
};

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

/** Lo que la calculadora sabe hoy, por id de producto. */
export async function economiaDeLaCalculadora(
  organizationId: string,
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
    const productId = porNombre.get(normalizar(a.producto));
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
    });
  }

  return salida;
}
