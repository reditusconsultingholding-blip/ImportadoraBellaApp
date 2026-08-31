import { calcular, type Economia } from "@/lib/economia";

// Qué hacer con un producto que está perdiendo plata.
//
// Las recomendaciones salen de la fórmula, no de un modelo: cada una dice el
// número que la justifica y ese número se puede rehacer a mano. Una sugerencia
// que no puede explicar de dónde sale no se puede discutir, y en una decisión
// de apagar o escalar una campaña eso importa más que el consejo.
//
// Son tres palancas y nada más, porque en contraentrega no hay más:
// pagar menos por venta, cobrar más, o entregar mejor.

export type Recomendacion = {
  /** Qué palanca toca. */
  palanca: "cpa" | "precio" | "operacion" | "apagar";
  titulo: string;
  detalle: string;
  /** Cuánto se recupera por checkout si se hace. Sirve para ordenarlas. */
  ganaPorCheckout: number | null;
};

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * El precio al que este producto dejaría de perder con el CPA que paga hoy.
 *
 * Se despeja de la misma fórmula del breakeven:
 *   cpa = precio·E − costo·E − flete·ef − gastoAdm·E
 * de donde precio = (cpa + costo·E + flete·ef + gastoAdm·E) / E
 */
function precioParaEquilibrio(e: Economia, cpa: number) {
  const entregados = e.efectividad * (1 - e.devoluciones);
  if (entregados <= 0) return null;
  return (cpa + e.costo * entregados + e.flete * e.efectividad + e.gastoAdm * entregados) / entregados;
}

export function recomendar(
  e: Economia,
  cpa: number | null,
  opciones: { gastoPauta?: number } = {}
): Recomendacion[] {
  const c = calcular(e, cpa);
  const out: Recomendacion[] = [];

  if (cpa == null) {
    return [
      {
        palanca: "operacion",
        titulo: "Sin CPA todavía",
        detalle:
          "Este producto no tiene compras atribuidas en el período, así que no hay un costo por venta que comparar contra el equilibrio. Con pauta corriendo unos días aparece.",
        ganaPorCheckout: null,
      },
    ];
  }

  const exceso = cpa - c.cpaBreakeven;

  // 1. Pagar menos por venta.
  if (exceso > 0) {
    out.push({
      palanca: "cpa",
      titulo: `Bajar el CPA a menos de ${money(c.cpaBreakeven)}`,
      detalle:
        `Hoy paga ${money(cpa)} por checkout y el equilibrio está en ${money(c.cpaBreakeven)}: ` +
        `pierde ${money(exceso)} en cada uno. Para tener margen y no solo empatar, la meta es ` +
        `${money(c.cpaObjetivo)}${opciones.gastoPauta ? `. Con el gasto de ${money(opciones.gastoPauta)} del período, cerrar esa brecha vale ${money((exceso / cpa) * opciones.gastoPauta)}` : ""}.`,
      ganaPorCheckout: exceso,
    });
  }

  // 2. Cobrar más.
  const precioNecesario = precioParaEquilibrio(e, cpa);
  if (precioNecesario != null && precioNecesario > e.precio) {
    const subida = precioNecesario - e.precio;
    out.push({
      palanca: "precio",
      titulo: `O subir el precio a ${money(precioNecesario)}`,
      detalle:
        `Son ${money(subida)} más que los ${money(e.precio)} de hoy (${pct(subida / e.precio)} arriba). ` +
        `Es la otra forma de cerrar la misma brecha, sin tocar la pauta. Ojo: subir el precio suele ` +
        `bajar la conversión, así que el CPA real puede subir y comerse parte de la mejora.`,
      ganaPorCheckout: exceso > 0 ? exceso : null,
    });
  }

  // 3. Entregar mejor. Acá está la plata escondida de la contraentrega.
  if (e.efectividad < 0.75) {
    const mejor = { ...e, efectividad: Math.min(e.efectividad + 0.1, 1) };
    const gana = calcular(mejor, cpa).cpaBreakeven - c.cpaBreakeven;
    out.push({
      palanca: "operacion",
      titulo: `Subir la confirmación desde ${pct(e.efectividad)}`,
      detalle:
        `Diez puntos más de confirmación mueven el equilibrio ${money(gana)} hacia arriba por checkout. ` +
        `Es la palanca más barata: no cuesta pauta ni margen, se gana llamando antes y mejor.`,
      ganaPorCheckout: gana,
    });
  }

  if (e.devoluciones > 0.08) {
    const mejor = { ...e, devoluciones: Math.max(e.devoluciones - 0.05, 0) };
    const gana = calcular(mejor, cpa).cpaBreakeven - c.cpaBreakeven;
    out.push({
      palanca: "operacion",
      titulo: `Bajar las devoluciones desde ${pct(e.devoluciones)}`,
      detalle:
        `Cinco puntos menos valen ${money(gana)} por checkout. Cada paquete que vuelve se paga dos ` +
        `veces el flete y no cobra nada: el flete de ${money(e.flete)} se paga sobre todo lo despachado, ` +
        `se entregue o no.`,
      ganaPorCheckout: gana,
    });
  }

  // 4. Apagar. Va último y solo cuando las otras no alcanzan.
  const alcanzable = out.some((r) => (r.ganaPorCheckout ?? 0) >= exceso);
  if (exceso > 0 && !alcanzable) {
    out.push({
      palanca: "apagar",
      titulo: "Si nada de lo anterior alcanza, apagarlo",
      detalle:
        `Ninguna palanca por separado cierra los ${money(exceso)} de brecha. Se puede combinar varias, ` +
        `pero mientras tanto cada checkout que se compra pierde plata${opciones.gastoPauta ? `, y en este período van ${money(opciones.gastoPauta)} de pauta` : ""}.`,
      ganaPorCheckout: null,
    });
  }

  // Lo que más recupera va primero: es lo que hay que mirar si solo se hace una.
  return out.sort((a, b) => (b.ganaPorCheckout ?? -1) - (a.ganaPorCheckout ?? -1));
}
