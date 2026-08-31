import type { Range } from "@/lib/date-range";
import { NOMBRE_GRANULARIDAD, type Granularidad } from "@/lib/reporte-medidas";

// El reparto de una serie en el tiempo: en qué barra cae cada instante, cómo
// se llama esa barra, cuánto de ella transcurrió de verdad y qué
// granularidades tiene sentido ofrecer para un período.
//
// Está aparte de quien consulta la base por la misma razón que
// reporte-medidas.ts: los gráficos son componentes de cliente y necesitan las
// etiquetas y los umbrales. Importarlos del módulo que arma la serie
// arrastraría Prisma al paquete del navegador.
//
// Y está aparte de cada serie porque ya son dos —la de Reportes y la de ventas
// del Panel— y partir el período en barras es exactamente el mismo problema en
// las dos. Estaba duplicado.

// Ecuador es UTC-5 todo el año (no tienen horario de verano) y el servidor
// corre en UTC. Una MARCA es la hora de pared de Ecuador escrita en los campos
// UTC de un Date, que es el mismo formato con el que date-range.ts guarda
// `from`/`to`. Un instante real —el `occurredAt` de una orden— se pasa a marca
// antes de decidir en qué barra cae: si no, una venta de las 21:00 en Ecuador
// cuenta como las 02:00 del día siguiente y el pico de ventas del gráfico
// aparece cinco horas corrido.
const OFFSET_MS = -5 * 3600_000;

export const marcaDe = (instante: Date) => new Date(instante.getTime() + OFFSET_MS);
export const instanteDe = (marca: Date) => new Date(marca.getTime() - OFFSET_MS);

export const isoDia = (d: Date) => d.toISOString().slice(0, 10);

/** El día de Ecuador al que pertenece un instante real. */
export const diaEcuador = (instante: Date) => isoDia(marcaDe(instante));

const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** El lunes de la semana de un día, como marca. */
export function lunesDe(dia: Date) {
  const dow = dia.getUTCDay(); // 0 domingo … 6 sábado
  const atras = dow === 0 ? 6 : dow - 1;
  return new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate() - atras));
}

/** La marca donde arranca el cubo en el que cae una marca cualquiera. */
export function inicioDeCubo(marca: Date, granularidad: Granularidad): Date {
  const a = marca.getUTCFullYear();
  const m = marca.getUTCMonth();
  const d = marca.getUTCDate();
  if (granularidad === "hora") return new Date(Date.UTC(a, m, d, marca.getUTCHours()));
  if (granularidad === "mes") return new Date(Date.UTC(a, m, 1));
  const dia = new Date(Date.UTC(a, m, d));
  return granularidad === "semana" ? lunesDe(dia) : dia;
}

/**
 * Dónde arranca el cubo siguiente, que es también el final natural de este.
 * "Natural" y no "visible": un mes dura lo que dura aunque el período lo corte
 * por la mitad, y esa diferencia es la que después dice si la barra está
 * completa o no.
 */
export function finDeCubo(inicio: Date, granularidad: Granularidad): Date {
  const a = inicio.getUTCFullYear();
  const m = inicio.getUTCMonth();
  const d = inicio.getUTCDate();
  switch (granularidad) {
    case "hora":
      return new Date(Date.UTC(a, m, d, inicio.getUTCHours() + 1));
    case "dia":
      return new Date(Date.UTC(a, m, d + 1));
    case "semana":
      return new Date(Date.UTC(a, m, d + 7));
    case "mes":
      return new Date(Date.UTC(a, m + 1, 1));
  }
}

/** Los cubos del período, en orden, como marcas de su arranque. */
export function cubosDelPeriodo(range: Range, granularidad: Granularidad): Date[] {
  const cubos: Date[] = [];
  const ultimo = marcaDe(range.toInstant).getTime();
  let cursor = inicioDeCubo(marcaDe(range.fromInstant), granularidad);
  while (cursor.getTime() <= ultimo) {
    cubos.push(cursor);
    cursor = finDeCubo(cursor, granularidad);
  }
  return cubos;
}

/** Lo corto, para el eje X. */
export function etiquetaDe(inicio: Date, granularidad: Granularidad) {
  if (granularidad === "hora") return `${inicio.getUTCHours()}h`;
  const d = inicio.getUTCDate();
  const m = MES_CORTO[inicio.getUTCMonth()];
  if (granularidad === "mes") return `${m} ${String(inicio.getUTCFullYear()).slice(2)}`;
  // Con el día y el mes juntos no hace falta adivinar dónde cambió el mes.
  return `${d} ${m}`;
}

/** Lo largo, para la lectura y la tabla. */
export function detalleDe(inicio: Date, fin: Date, granularidad: Granularidad) {
  const largo = (d: Date) => `${d.getUTCDate()} ${MES_CORTO[d.getUTCMonth()]}`;
  if (granularidad === "hora") {
    const h = String(inicio.getUTCHours()).padStart(2, "0");
    return `${largo(inicio)}, ${h}:00–${h}:59`;
  }
  if (granularidad === "dia") return largo(inicio);
  if (granularidad === "mes") {
    return `${MES_CORTO[inicio.getUTCMonth()]} ${inicio.getUTCFullYear()}`;
  }
  // Una semana cortada por el borde del período puede quedar en un solo día, y
  // "2 ago — 2 ago" se lee como un error de la pantalla.
  if (isoDia(inicio) === isoDia(fin)) return largo(inicio);
  return `${largo(inicio)} — ${largo(fin)}`;
}

/**
 * Qué porción del cubo cae dentro de la ventana de la que se sabe algo: lo que
 * ya transcurrió, dentro del período pedido, y con órdenes sincronizadas
 * detrás.
 *
 * Cero significa que ahí no hay nada que saber —la hora todavía no llegó, o el
 * mes es anterior a la primera orden guardada—, y una barra en cero diría que
 * en ese rato no se vendió nada. Entre 0 y 1 el cubo está a medio transcurrir
 * o cortado por el borde del período: sirve, pero no se puede comparar de
 * igual a igual contra uno completo.
 */
export function coberturaDelCubo(
  inicio: Date,
  granularidad: Granularidad,
  ventana: { desde: Date; hasta: Date }
): number {
  const arranca = instanteDe(inicio).getTime();
  const termina = instanteDe(finDeCubo(inicio, granularidad)).getTime();
  const a = Math.max(arranca, ventana.desde.getTime());
  const b = Math.min(termina, ventana.hasta.getTime());
  return Math.max(0, (b - a) / (termina - arranca));
}

/**
 * Cuál de los cubos tiene el cursor encima, a partir de lo que avisa recharts.
 *
 * El índice llega como CADENA ("3"), no como número: en recharts 3 el tipo del
 * campo es `number | TooltipIndex | undefined` y `TooltipIndex` es
 * `string | null`. Preguntar `typeof === "number"` no rompe ni avisa —el tipo
 * lo admite—, simplemente nunca da verdadero, y la lectura fija que está
 * arriba de los dos gráficos se queda para siempre en "pasa el cursor por una
 * barra". Así estaba desde que se subió a recharts 3.
 */
export function cuboBajoElCursor<T>(indice: unknown, cubos: T[]): T | null {
  if (typeof indice === "number") return cubos[indice] ?? null;
  if (typeof indice !== "string" || indice === "") return null;
  const i = Number(indice);
  return Number.isInteger(i) ? (cubos[i] ?? null) : null;
}

// --- Qué granularidades se pueden ofrecer -------------------------------

/**
 * La banda de barras que se lee de un vistazo.
 *
 * Por debajo del mínimo la granularidad no muestra la forma de nada: treinta
 * días agrupados por mes son una sola barra. Por encima del máximo son rayas
 * de un píxel que ni con scroll se comparan.
 */
const MIN_BARRAS = 4;
const MAX_BARRAS = 62;

/** Por hora solo en rangos cortos: una semana serían 168 barras. */
const MAX_DIAS_POR_HORA = 2;

/** De la más fina a la más gruesa. El orden manda en los botones. */
export const GRANULARIDADES: Granularidad[] = ["hora", "dia", "semana", "mes"];

const ETIQUETA_GRANULARIDAD: Record<Granularidad, string> = {
  hora: "Por hora",
  dia: "Por día",
  semana: "Por semana",
  mes: "Por mes",
};

const UNIDAD: Record<Granularidad, string> = {
  hora: "una hora",
  dia: "un día",
  semana: "una semana",
  mes: "un mes",
};

export type OpcionGranularidad = {
  id: Granularidad;
  label: string;
  barras: number;
  /** Por qué no se puede elegir, para decirlo en el botón. `null` cuando sí. */
  impedimento: string | null;
};

/**
 * Las cuatro granularidades para este período, con el motivo de las que no
 * sirven.
 *
 * Las que no aplican no se esconden: quedan apagadas con la explicación
 * encima. Un botón que desaparece parece un error de la pantalla; uno apagado
 * que dice "el período es un mes: partirlo por mes da una sola barra" enseña
 * cómo funciona el selector.
 *
 * La regla del mínimo tiene una excepción: si no quedó ninguna granularidad
 * más fina disponible, la que sigue se ofrece igual aunque dé pocas barras.
 * Entre tres barras y ninguna, tres.
 */
export function opcionesDeGranularidad(range: Range): OpcionGranularidad[] {
  const dias = cubosDelPeriodo(range, "dia").length;
  let hayMasFina = false;

  const opciones = GRANULARIDADES.map((id) => {
    // Las horas no se enumeran: el rango siempre cubre días completos de
    // Ecuador, y ahí no hay horario de verano que corra una hora.
    const barras = id === "hora" ? dias * 24 : cubosDelPeriodo(range, id).length;

    let impedimento: string | null = null;
    if (id === "hora" && dias > MAX_DIAS_POR_HORA) {
      impedimento = `Por hora solo hasta ${MAX_DIAS_POR_HORA} días: ${dias} días serían ${barras} barras.`;
    } else if (barras > MAX_BARRAS) {
      impedimento = `Serían ${barras} barras de un píxel; el tope son ${MAX_BARRAS}.`;
    } else if (barras < MIN_BARRAS && hayMasFina) {
      impedimento =
        barras === 1
          ? `El período es ${UNIDAD[id]}: partirlo ${NOMBRE_GRANULARIDAD[id]} da una sola barra.`
          : `Solo ${barras} barras: ${NOMBRE_GRANULARIDAD[id]} no muestra la forma del período.`;
    }
    if (!impedimento) hayMasFina = true;

    return { id, label: ETIQUETA_GRANULARIDAD[id], barras, impedimento };
  });

  // Un período de más de cinco años pasa de 62 meses y se quedaría sin
  // ninguna opción. Solo se llega ahí con "entre dos fechas", pero un gráfico
  // largo es mejor que una tarjeta vacía.
  if (opciones.every((o) => o.impedimento)) {
    const mes = opciones[opciones.length - 1];
    return [...opciones.slice(0, -1), { ...mes, impedimento: null }];
  }
  return opciones;
}

/**
 * Con qué granularidad se abre el período.
 *
 * Es la más gruesa que todavía deja una cantidad de barras legible: un gráfico
 * que arranca con 366 rayas no informa, y uno de 4 barras tampoco. Sale del
 * largo del período y no de qué botón de rango se apretó, así que "entre dos
 * fechas" queda tratado igual que un rango con nombre.
 *
 * Da justo lo que se pidió: hoy y ayer por hora, 7 y 30 días por día, 3 y 6
 * meses por semana, 9 y 12 meses por mes.
 */
export function granularidadPorDefecto(
  range: Range,
  opciones: OpcionGranularidad[]
): Granularidad {
  const dias = cubosDelPeriodo(range, "dia").length;
  const deseada: Granularidad =
    dias <= MAX_DIAS_POR_HORA
      ? "hora"
      : dias <= MAX_BARRAS
        ? "dia"
        : dias <= 200
          ? "semana"
          : "mes";

  const ofrecibles = opciones.filter((o) => !o.impedimento);
  if (ofrecibles.some((o) => o.id === deseada)) return deseada;
  // Si la deseada no se puede —un período raro de "entre dos fechas"—, la más
  // gruesa de las que sí, que es la que menos barras deja.
  return ofrecibles[ofrecibles.length - 1].id;
}
