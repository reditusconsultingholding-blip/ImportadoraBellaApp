import { db } from "@/lib/db";
import type { Range } from "@/lib/date-range";

// El pulso de un producto: qué tan bien está funcionando hoy y hacia dónde va.
//
// El puntaje se CALCULA, no lo opina un modelo. Dos razones: tiene que dar lo
// mismo dos veces seguidas, y tiene que poder explicarse en una línea. La IA
// entra después, para redactar qué hacer — nunca para poner el número.

export type PulseState = "SANO" | "VIGILAR" | "RIESGO" | "SIN_DATOS";

export type Pulse = {
  productId: string | null;
  code: string | null;
  name: string;
  score: number;
  state: PulseState;
  spend: number;
  purchases: number;
  cpa: number | null;
  cpaTarget: number | null;
  /** Serie diaria de gasto, para el trazo. Del más viejo al más nuevo. */
  serie: number[];
  motivos: string[];
  /**
   * Los mismos motivos, sin una sola cifra de dinero.
   *
   * No es el texto de arriba con los montos borrados: se redacta aparte porque
   * quitarle los números a una frase deja huecos —"CPA de  contra un objetivo
   * de "— que se leen como un error de la app. Quien no ve plata recibe solo
   * este arreglo; el otro ni sale del servidor.
   */
  motivosSinCifras: string[];
};

/**
 * El pulso tal como VIAJA al navegador.
 *
 * Sin el permiso de finanzas no lleva `spend`, `cpa` ni `cpaTarget`, y la
 * serie del trazo va en escala relativa. Ese detalle importa: la serie son los
 * dólares gastados día por día, y aunque el dibujo salga igual, los números
 * crudos quedan en el HTML de la página y se leen con inspeccionar elemento.
 */
export type PulseVisible = {
  productId: string | null;
  code: string | null;
  name: string;
  score: number;
  state: PulseState;
  purchases: number;
  serie: number[];
  motivos: string[];
  spend?: number;
  cpa?: number | null;
  cpaTarget?: number | null;
};

/**
 * La misma forma del trazo, sin los montos.
 *
 * PulseLine ya normaliza contra el máximo de la serie que recibe, así que
 * dividir por el pico dibuja exactamente lo mismo con números que no son
 * plata.
 */
function serieRelativa(serie: number[]) {
  const pico = Math.max(0, ...serie);
  if (pico <= 0) return serie.map(() => 0);
  return serie.map((v) => Number((v / pico).toFixed(4)));
}

export function pulsosVisibles(pulses: Pulse[], verCifras: boolean): PulseVisible[] {
  return pulses.map((p) => {
    if (verCifras) {
      return {
        productId: p.productId,
        code: p.code,
        name: p.name,
        score: p.score,
        state: p.state,
        purchases: p.purchases,
        serie: p.serie,
        motivos: p.motivos,
        spend: p.spend,
        cpa: p.cpa,
        cpaTarget: p.cpaTarget,
      };
    }
    return {
      productId: p.productId,
      code: p.code,
      name: p.name,
      score: p.score,
      state: p.state,
      purchases: p.purchases,
      serie: serieRelativa(p.serie),
      motivos: p.motivosSinCifras,
    };
  });
}

/**
 * Umbral del semáforo.
 *
 * El corte está en el CPA objetivo del producto, que sale de su economía real
 * (precio, costo, confirmación y devoluciones — ver la calculadora). Un CPA
 * por debajo del objetivo deja plata; por encima, la quema.
 */
const VERDE = 70;
const AMARILLO = 40;

function estadoPara(score: number): PulseState {
  if (score >= VERDE) return "SANO";
  if (score >= AMARILLO) return "VIGILAR";
  return "RIESGO";
}

/**
 * Convierte "cuántas veces el objetivo estoy pagando" en un puntaje.
 *
 * A 0,7 del objetivo o mejor es 100: pagar bastante menos de lo que se puede
 * no lo hace "más sano", así que se corta ahí. A 1,5 veces el objetivo es 0:
 * a esa altura el producto ya no discute, pierde.
 */
function puntajePorCpa(ratio: number) {
  if (!Number.isFinite(ratio)) return 0;
  if (ratio <= 0.7) return 100;
  if (ratio >= 1.5) return 0;
  return Math.round(((1.5 - ratio) / (1.5 - 0.7)) * 100);
}

/** Compara la segunda mitad del período contra la primera. */
function tendencia(serie: number[], compras: number[]) {
  const mitad = Math.floor(serie.length / 2);
  if (mitad < 1) return null;

  const cpaDe = (gastos: number[], comp: number[]) => {
    const g = gastos.reduce((a, b) => a + b, 0);
    const c = comp.reduce((a, b) => a + b, 0);
    return c > 0 ? g / c : null;
  };

  const antes = cpaDe(serie.slice(0, mitad), compras.slice(0, mitad));
  const despues = cpaDe(serie.slice(mitad), compras.slice(mitad));
  if (antes == null || despues == null || antes === 0) return null;
  return (despues - antes) / antes; // negativo = mejorando
}

export async function getPulses(organizationId: string, range: Range): Promise<Pulse[]> {
  const productos = await db.product.findMany({
    where: { organizationId, archived: false },
    select: {
      id: true,
      code: true,
      name: true,
      cpaTarget: true,
      campaigns: {
        select: {
          metrics: {
            where: { capturedAt: { gte: range.from, lte: range.to } },
            select: { capturedAt: true, spend: true, purchases: true },
          },
        },
      },
    },
  });

  const pulses: Pulse[] = [];

  for (const p of productos) {
    // Un producto puede tener varias campañas en varias plataformas; el pulso
    // es del producto, así que se suman por día.
    const porDia = new Map<string, { spend: number; purchases: number }>();
    for (const c of p.campaigns) {
      for (const m of c.metrics) {
        const dia = m.capturedAt.toISOString().slice(0, 10);
        const acc = porDia.get(dia) ?? { spend: 0, purchases: 0 };
        acc.spend += m.spend;
        acc.purchases += m.purchases;
        porDia.set(dia, acc);
      }
    }

    const dias = [...porDia.keys()].sort();
    const serie = dias.map((d) => porDia.get(d)!.spend);
    const comprasSerie = dias.map((d) => porDia.get(d)!.purchases);
    const spend = serie.reduce((a, b) => a + b, 0);
    const purchases = comprasSerie.reduce((a, b) => a + b, 0);

    if (spend <= 0) {
      pulses.push({
        productId: p.id,
        code: p.code,
        name: p.name,
        score: 0,
        state: "SIN_DATOS",
        spend: 0,
        purchases: 0,
        cpa: null,
        cpaTarget: p.cpaTarget,
        serie: [],
        motivos: ["No tuvo pauta en este período."],
        motivosSinCifras: ["No tuvo pauta en este período."],
      });
      continue;
    }

    const cpa = purchases > 0 ? spend / purchases : null;
    const motivos: string[] = [];
    const motivosSinCifras: string[] = [];

    let score: number;
    if (cpa == null) {
      score = 0;
      motivos.push(`Gastó ${spend.toFixed(0)} dólares sin una sola compra atribuida.`);
      motivosSinCifras.push("Tuvo pauta en el período y no atribuyó ni una compra.");
    } else if (p.cpaTarget > 0) {
      const ratio = cpa / p.cpaTarget;
      score = puntajePorCpa(ratio);
      motivos.push(
        ratio <= 1
          ? `CPA de ${cpa.toFixed(2)} contra un objetivo de ${p.cpaTarget.toFixed(2)}: paga menos de lo que puede.`
          : `CPA de ${cpa.toFixed(2)} contra un objetivo de ${p.cpaTarget.toFixed(2)}: paga ${Math.round((ratio - 1) * 100)}% de más.`
      );
      // El desvío en porcentaje sí queda: dice si conviene escalar o corregir
      // sin decir cuánto cuesta una compra ni cuánto se puede llegar a pagar.
      motivosSinCifras.push(
        ratio <= 1
          ? `El costo por compra está ${Math.round((1 - ratio) * 100)}% por debajo del objetivo del producto.`
          : `El costo por compra está ${Math.round((ratio - 1) * 100)}% por encima del objetivo del producto.`
      );
    } else {
      // Sin objetivo cargado no hay contra qué comparar. Se dice, en vez de
      // mostrar un verde que no significa nada.
      score = 50;
      motivos.push("No tiene CPA objetivo cargado, así que el pulso es provisional.");
      motivosSinCifras.push("No tiene objetivo cargado, así que el pulso es provisional.");
    }

    const tend = tendencia(serie, comprasSerie);
    if (tend != null && Math.abs(tend) >= 0.1) {
      const puntos = tend < 0 ? 10 : -10;
      score = Math.max(0, Math.min(100, score + puntos));
      motivos.push(
        tend < 0
          ? `El CPA viene bajando ${Math.round(Math.abs(tend) * 100)}% respecto al arranque del período.`
          : `El CPA viene subiendo ${Math.round(tend * 100)}% respecto al arranque del período.`
      );
      motivosSinCifras.push(
        tend < 0
          ? `El costo por compra viene bajando ${Math.round(Math.abs(tend) * 100)}% respecto al arranque del período.`
          : `El costo por compra viene subiendo ${Math.round(tend * 100)}% respecto al arranque del período.`
      );
    }

    pulses.push({
      productId: p.id,
      code: p.code,
      name: p.name,
      score,
      state: estadoPara(score),
      spend,
      purchases,
      cpa,
      cpaTarget: p.cpaTarget,
      serie,
      motivos,
      motivosSinCifras,
    });
  }

  // Primero lo que más plata mueve dentro de cada estado: un producto en
  // riesgo que gasta 5 dólares no es la urgencia del día.
  const orden: Record<PulseState, number> = { RIESGO: 0, VIGILAR: 1, SANO: 2, SIN_DATOS: 3 };
  return pulses.sort((a, b) => orden[a.state] - orden[b.state] || b.spend - a.spend);
}
