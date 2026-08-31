import { db } from "@/lib/db";
import { resolveRange } from "@/lib/date-range";
import { calcular, economiaDe, tieneEconomiaReal } from "@/lib/economia";
import { getPulses } from "@/lib/pulse";
import { ESTADOS_CREATIVO, REQUIREMENT_STATUSES } from "@/lib/pipeline-options";

// El pulso de creativos: ¿este producto necesita piezas nuevas, o hay que
// hacer más de las que ya están ganando?
//
// El pulso de pulse.ts responde "¿cómo va el producto?". Esa pregunta se
// contesta con un número de plata y no le dice nada al editor, que lo único
// que necesita saber es en qué producto empezar a producir hoy. Esto responde
// eso, y por eso mira dos cosas que el otro no cruza: cómo se mueve el CPA de
// una semana a la otra —un creativo gastado se ve ahí antes que en ningún otro
// lado— y cuántas piezas vivas tiene el producto en el pipeline.
//
// Es determinista de punta a punta. El mismo día con los mismos datos da el
// mismo veredicto, y cada motivo trae el número que lo justifica: si alguien no
// está de acuerdo, tiene contra qué discutir.

/**
 * La ventana que se compara contra la anterior de igual largo.
 *
 * Siete días, el mismo corte que las alertas diarias, y por lo mismo: un mal
 * martes no es fatiga de creativo, y mandar a producir una tanda por un mal
 * martes quema horas de edición que hacen falta en otro producto.
 */
export const VENTANA_DIAS = 7;

/**
 * Gasto mínimo en la ventana para que el veredicto signifique algo.
 *
 * Las alertas diarias piden 150 porque deciden si se apaga la pauta. Acá el
 * costo de equivocarse es más barato —unas horas de edición contra ventas
 * perdidas—, así que el listón baja a 100 y entran productos más chicos.
 */
const GASTO_MINIMO = 100;

/**
 * Compras atribuidas mínimas para tratar al CPA como un CPA.
 *
 * Con cuatro compras, una sola venta más mueve el CPA un 25% y la "tendencia"
 * pasa a ser ruido. Se exige en las DOS ventanas antes de hablar de fatiga.
 */
const COMPRAS_MINIMAS = 5;

/**
 * Cuánto tiene que subir el CPA de una semana a la otra para llamarlo fatiga.
 *
 * Por debajo del 15% se mueve solo: Meta reescribe las compras de los últimos
 * días con retraso, y eso ya vale varios puntos. Al 15% sostenido lo que se
 * gastó es el creativo, no el producto.
 */
const SUBIDA_CPA_FATIGA = 0.15;

/**
 * Qué tan por debajo del punto de equilibrio hay que estar para escalar.
 *
 * Es el MISMO 0,75 de las alertas diarias, a propósito. Con un corte propio
 * habría productos marcados para escalar acá que el panel no marca, y nadie
 * sabría a cuál de los dos hacerle caso.
 */
const MARGEN_PARA_ESCALAR = 0.75;

/**
 * El piso de creativos vivos: una ronda completa.
 *
 * No es un número elegido de cero — es la unidad con la que ya trabaja el
 * equipo (ver REGLAS_DE_RONDA en pipeline-options). Por debajo de cuatro
 * piezas no hay diversidad de formato ni de ángulo, así que aunque el CPA esté
 * bien no se puede saber QUÉ está funcionando.
 */
const CREATIVOS_POR_RONDA = 4;

/**
 * Cuánta pauta diaria aguanta una sola pieza.
 *
 * Por debajo de estos 40 dólares una pieza no junta impresiones suficientes en
 * el día como para juzgarla; por encima, se le muestra tantas veces a la misma
 * gente que se satura sola. O sea que cuántos creativos necesita un producto no
 * es un número fijo: crece con el presupuesto.
 */
const GASTO_DIARIO_POR_CREATIVO = 40;

/**
 * Techo de lo que se le puede exigir a un producto: tres rondas.
 *
 * Más arriba el cuello de botella deja de ser la cantidad de piezas y pasa a
 * ser la oferta o la estructura de campaña, y pedir veinte creativos solo
 * garantiza que no se haga ninguno.
 */
const CREATIVOS_MAXIMOS = CREATIVOS_POR_RONDA * 3;

type EstadoCreativo = (typeof ESTADOS_CREATIVO)[number];
type SituacionCreativo = (typeof REQUIREMENT_STATUSES)[number];

/** Piezas ya producidas: las únicas que pueden estar corriendo en la pauta. */
const PRODUCIDAS: readonly SituacionCreativo[] = ["REALIZADO", "EDITADO", "TESTEADO"];

/**
 * Producida pero ya no trabaja. Se descuenta del conteo de vivas: un producto
 * con diez piezas de las que ocho están saturadas tiene dos, no diez.
 */
const QUEMADOS: readonly EstadoCreativo[] = [
  "Kill temprano",
  "Kill definitivo",
  "Saturado",
  "Fatiga de funnel",
  "Reemplazado",
];

/** Las que ya demostraron que venden: de estas salen las variaciones. */
const GANADORES: readonly EstadoCreativo[] = [
  "Winner inicial",
  "Winner validado",
  "En OP",
  "En escalamiento",
];

const esProducida = new Set<string>(PRODUCIDAS);
const esQuemado = new Set<string>(QUEMADOS);
const esGanador = new Set<string>(GANADORES);

export type VeredictoCreativos = "NECESITA" | "ESCALAR" | "SUFICIENTE" | "SIN_DATOS";

export type PulsoCreativos = {
  productId: string;
  code: string;
  name: string;
  veredicto: VeredictoCreativos;
  /** Cada uno trae el número que lo sostiene. Sin número, no va. */
  motivos: string[];

  gasto: number;
  /** Atribuidas por la plataforma, no órdenes cobradas de Shopify. */
  compras: number;
  cpa: number | null;
  cpaPrevio: number | null;
  /** Fracción: 0,22 es "subió 22% contra la semana anterior". */
  variacionCpa: number | null;
  /** Serie diaria de gasto de la ventana, para el trazo. */
  serie: number[];

  /** Contra qué se compara el CPA: el equilibrio real, o el objetivo cargado. */
  equilibrio: number | null;
  /** true cuando el umbral sale del cpaTarget a mano y no de la economía real. */
  umbralProvisional: boolean;
  /** Cuánto más se puede pagar por compra antes de dejar de ganar, en %. */
  margenSobreEquilibrio: number | null;

  creativosVivos: number;
  creativosEnProduccion: number;
  creativosQuemados: number;
  creativosGanadores: number;
  /** Cuántos pide su nivel de gasto. 0 cuando no hay pauta que sostener. */
  creativosExigidos: number;
};

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const money2 = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const pct = (f: number) => `${Math.round(Math.abs(f) * 100)}%`;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Cuántas piezas vivas pide el gasto que hoy tiene el producto.
 *
 * Nunca menos de una ronda, nunca más de tres: por debajo no se puede leer qué
 * funciona, por arriba el problema ya no son los creativos.
 */
function creativosQuePide(gastoDiario: number) {
  const porPresupuesto = Math.ceil(gastoDiario / GASTO_DIARIO_POR_CREATIVO);
  return Math.min(CREATIVOS_MAXIMOS, Math.max(CREATIVOS_POR_RONDA, porPresupuesto));
}

/**
 * Las dos ventanas que compara el pulso.
 *
 * Se arman con resolveRange y no a mano: ahí vive la cuenta de que el día de
 * Ecuador arranca a las 05:00 UTC, y duplicarla acá haría que este pulso mirara
 * un día distinto del que mira el panel. Se exporta la actual porque la pestaña
 * de campañas activas tiene que mostrar EXACTAMENTE el mismo período — si una
 * dijera siete días y la otra treinta, los dos números se leerían como si
 * hablaran de lo mismo.
 */
export function ventanasDelPulso() {
  const dia = 24 * 3600_000;
  const hoy = resolveRange("hoy").from;
  const inicioActual = new Date(hoy.getTime() - (VENTANA_DIAS - 1) * dia);
  const finPrevio = new Date(inicioActual.getTime() - dia);
  const inicioPrevio = new Date(finPrevio.getTime() - (VENTANA_DIAS - 1) * dia);

  return {
    actual: resolveRange("personalizado", isoDay(inicioActual), isoDay(hoy)),
    previa: resolveRange("personalizado", isoDay(inicioPrevio), isoDay(finPrevio)),
  };
}

export async function getPulsoCreativos(organizationId: string): Promise<PulsoCreativos[]> {
  const { actual: ventanaActual, previa: ventanaPrevia } = ventanasDelPulso();

  const [ahora, antes, productos, creativos] = await Promise.all([
    // El gasto, las compras y el CPA salen de getPulses, no de una consulta
    // propia. Es la misma función que alimenta el panel y el directorio: si acá
    // el CPA diera otro número, no habría forma de saber cuál creer.
    getPulses(organizationId, ventanaActual),
    getPulses(organizationId, ventanaPrevia),
    db.product.findMany({
      where: { organizationId, archived: false },
      select: {
        id: true,
        code: true,
        name: true,
        cpaTarget: true,
        salePrice: true,
        unitCost: true,
        efectividad: true,
        devoluciones: true,
        flete: true,
        gastoAdmPorPedido: true,
      },
    }),
    db.requirement.findMany({
      // Sin el histórico: son más de seis mil piezas archivadas de otra
      // operación, y contarlas como creativos vivos daría por cubierto a
      // cualquier producto que alguna vez pasó por la planilla.
      where: { organizationId, productId: { not: null }, origen: null },
      select: { productId: true, status: true, estado: true },
    }),
  ]);

  const pulsoActual = new Map(ahora.map((p) => [p.productId, p]));
  const pulsoPrevio = new Map(antes.map((p) => [p.productId, p]));

  type Conteo = { vivos: number; produccion: number; quemados: number; ganadores: number };
  const conteos = new Map<string, Conteo>();

  for (const c of creativos) {
    if (!c.productId) continue;
    const acc = conteos.get(c.productId) ?? { vivos: 0, produccion: 0, quemados: 0, ganadores: 0 };
    if (!esProducida.has(c.status)) {
      acc.produccion += 1;
    } else if (c.estado && esQuemado.has(c.estado)) {
      acc.quemados += 1;
    } else {
      acc.vivos += 1;
    }
    if (c.estado && esGanador.has(c.estado)) acc.ganadores += 1;
    conteos.set(c.productId, acc);
  }

  const lista: PulsoCreativos[] = [];

  for (const p of productos) {
    const actual = pulsoActual.get(p.id);
    const previo = pulsoPrevio.get(p.id);
    const conteo = conteos.get(p.id) ?? { vivos: 0, produccion: 0, quemados: 0, ganadores: 0 };

    const gasto = actual?.spend ?? 0;
    const compras = actual?.purchases ?? 0;
    const cpa = actual?.cpa ?? null;
    const cpaPrevio = previo?.cpa ?? null;

    const base = {
      productId: p.id,
      code: p.code,
      name: p.name,
      gasto,
      compras,
      cpa,
      cpaPrevio,
      serie: actual?.serie ?? [],
      creativosVivos: conteo.vivos,
      creativosEnProduccion: conteo.produccion,
      creativosQuemados: conteo.quemados,
      creativosGanadores: conteo.ganadores,
    };

    if (gasto < GASTO_MINIMO) {
      lista.push({
        ...base,
        veredicto: "SIN_DATOS",
        variacionCpa: null,
        equilibrio: null,
        umbralProvisional: false,
        margenSobreEquilibrio: null,
        creativosExigidos: 0,
        motivos: [
          gasto <= 0
            ? `No tuvo pauta en los últimos ${VENTANA_DIAS} días, así que no hay nada que diga si le faltan creativos.`
            : `Solo gastó ${money(gasto)} en ${VENTANA_DIAS} días: por debajo de ${money(GASTO_MINIMO)} cualquier lectura del CPA es ruido.`,
        ],
      });
      continue;
    }

    // El umbral contra el que se juzga. La economía real manda; el cpaTarget
    // cargado a mano es el plan B y queda marcado como tal. Nunca se completa
    // la economía con supuestos para poder dar un veredicto: economiaDe() asume
    // 100% de efectividad cuando falta, y un "escalá" apoyado en ese supuesto
    // manda a gastar más en un producto que puede estar perdiendo plata.
    const economia = tieneEconomiaReal(p) ? economiaDe(p) : null;
    const equilibrio = economia
      ? calcular(economia, cpa).cpaBreakeven
      : p.cpaTarget > 0
        ? p.cpaTarget
        : null;
    const umbralProvisional = economia == null && equilibrio != null;
    const umbralEscalar = equilibrio == null ? null : equilibrio * MARGEN_PARA_ESCALAR;

    const gastoDiario = gasto / VENTANA_DIAS;
    const exigidos = creativosQuePide(gastoDiario);
    // Las que están en edición cuentan como cubiertas: si no, el pipeline
    // pediría otra tanda de lo mismo que ya se está produciendo.
    const cubiertos = conteo.vivos + conteo.produccion;
    const faltan = Math.max(0, exigidos - cubiertos);

    const datosFirmes = compras >= COMPRAS_MINIMAS && (previo?.purchases ?? 0) >= COMPRAS_MINIMAS;
    const variacionCpa =
      datosFirmes && cpa != null && cpaPrevio != null && cpaPrevio > 0
        ? (cpa - cpaPrevio) / cpaPrevio
        : null;
    const fatiga = variacionCpa != null && variacionCpa >= SUBIDA_CPA_FATIGA;

    const puedeEscalar =
      umbralEscalar != null && cpa != null && compras >= COMPRAS_MINIMAS && cpa <= umbralEscalar;

    const margenSobreEquilibrio =
      equilibrio != null && cpa != null && cpa > 0 ? ((equilibrio - cpa) / cpa) * 100 : null;

    const motivos: string[] = [];
    let veredicto: VeredictoCreativos;

    if (cpa == null) {
      veredicto = "NECESITA";
      motivos.push(
        `Gastó ${money(gasto)} en ${VENTANA_DIAS} días sin una sola compra atribuida. Puede ser el creativo, pero también la oferta o la página: conviene mirarlo antes de mandar a editar.`
      );
    } else if (fatiga) {
      // La fatiga gana sobre todo lo demás, incluso si el CPA todavía está por
      // debajo del umbral. Producir una tanda tarda días: si se espera a que
      // cruce, para cuando las piezas estén listas ya se perdió la plata.
      veredicto = "NECESITA";
      motivos.push(
        `CPA de ${money2(cpa)} en los últimos ${VENTANA_DIAS} días contra ${money2(cpaPrevio!)} en los ${VENTANA_DIAS} anteriores: subió ${pct(variacionCpa!)} con ${compras} compras atribuidas de por medio. Así se ve un creativo gastándose.`
      );
    } else if (puedeEscalar) {
      veredicto = "ESCALAR";
      motivos.push(
        `CPA de ${money2(cpa)} contra un ${umbralProvisional ? "objetivo" : "punto de equilibrio"} de ${money2(equilibrio!)}: aguanta ${Math.round(margenSobreEquilibrio!)}% más de costo por compra antes de dejar de ganar.`
      );
      motivos.push(
        `Gastó ${money(gasto)} en ${VENTANA_DIAS} días con ${compras} compras atribuidas${
          variacionCpa == null
            ? "."
            : variacionCpa <= 0
              ? ` y el CPA todavía viene bajando ${pct(variacionCpa)}.`
              : ` y el CPA subió apenas ${pct(variacionCpa)}, por debajo del ${pct(SUBIDA_CPA_FATIGA)} que marca fatiga.`
        }`
      );
      motivos.push(
        conteo.ganadores > 0
          ? `Tiene ${conteo.ganadores} ${conteo.ganadores === 1 ? "pieza declarada ganadora" : "piezas declaradas ganadoras"} en el pipeline: las variaciones salen de esas, no de un ángulo nuevo.`
          : "Ninguna de sus piezas está marcada como ganadora en el pipeline, así que primero hay que ver cuál está trayendo las ventas y recién después producir variaciones de esa."
      );
    } else if (faltan > 0) {
      veredicto = "NECESITA";
      motivos.push(
        `Tiene ${conteo.vivos} ${conteo.vivos === 1 ? "creativo vivo" : "creativos vivos"} para ${money(gastoDiario)} de pauta al día: a razón de una pieza por cada ${money(GASTO_DIARIO_POR_CREATIVO)} diarios harían falta ${exigidos}, y faltan ${faltan}.`
      );
    } else {
      veredicto = "SUFICIENTE";
      motivos.push(
        `Tiene ${cubiertos} ${cubiertos === 1 ? "pieza" : "piezas"} entre vivas y en edición, que cubre las ${exigidos} que pide su nivel de gasto.`
      );
      if (cpa != null && equilibrio != null) {
        motivos.push(
          umbralEscalar != null && cpa > umbralEscalar && cpa <= equilibrio
            ? `CPA de ${money2(cpa)} contra un ${umbralProvisional ? "objetivo" : "equilibrio"} de ${money2(equilibrio)}: gana, pero no lo suficiente como para escalar — el corte está en ${money2(umbralEscalar)}.`
            : `CPA de ${money2(cpa)} contra un ${umbralProvisional ? "objetivo" : "equilibrio"} de ${money2(equilibrio)}.`
        );
      }
    }

    // Lo que matiza el veredicto va después del motivo principal, no antes.
    if (conteo.quemados > 0) {
      motivos.push(
        `De sus ${conteo.quemados + conteo.vivos} piezas producidas, ${conteo.quemados} están marcadas como saturadas, killeadas o reemplazadas, así que no cuentan como creativo vivo.`
      );
    }
    if (veredicto === "NECESITA" && conteo.produccion > 0) {
      motivos.push(
        `Ya hay ${conteo.produccion} ${conteo.produccion === 1 ? "pieza" : "piezas"} en producción para este producto: mira la cola antes de pedir otra tanda.`
      );
    }
    if (equilibrio == null) {
      motivos.push(
        "No tiene economía cargada ni CPA objetivo, así que el veredicto se apoya solo en la cantidad de creativos. Carga precio, costo, flete y efectividad para que el umbral sea real."
      );
    } else if (umbralProvisional) {
      motivos.push(
        `El umbral es el CPA objetivo cargado a mano (${money2(equilibrio)}), no el punto de equilibrio real: falta cargar efectividad, flete o devoluciones.`
      );
    }
    if (cpa != null && !datosFirmes) {
      motivos.push(
        `Solo ${compras} compras atribuidas en la ventana: alcanza para un CPA aproximado, no para hablar de tendencia contra la semana anterior.`
      );
    }

    lista.push({
      ...base,
      veredicto,
      variacionCpa,
      equilibrio,
      umbralProvisional,
      margenSobreEquilibrio,
      creativosExigidos: exigidos,
      motivos,
    });
  }

  // Primero lo que está quemando plata, después lo que la está dejando sobre la
  // mesa, y dentro de cada grupo lo que más gasta. Es el mismo orden de las
  // alertas diarias: dos pantallas que priorizan distinto se contradicen.
  const orden: Record<VeredictoCreativos, number> = {
    NECESITA: 0,
    ESCALAR: 1,
    SUFICIENTE: 2,
    SIN_DATOS: 3,
  };
  return lista.sort((a, b) => orden[a.veredicto] - orden[b.veredicto] || b.gasto - a.gasto);
}
