// A qué hora cierra el día para el reporte diario.
//
// Fabrizio lo pidió así: "los reportes diarios se generan a las 11:59 de la
// noche hora Ecuador". Antes el reloj generaba "el de ayer" recién cuando el
// día ya había cambiado en Ecuador, así que el PDF del lunes aparecía el
// martes a las 00:05 — el cierre llegaba cuando ya nadie iba a hacer nada con
// él esa noche.
//
// Ecuador es UTC-5 todo el año (no tienen horario de verano) y el servidor
// corre en UTC: las 23:59 de Ecuador son las 04:59 UTC del día SIGUIENTE.
// Cualquier cuenta que use la hora del servidor sin ese corrimiento se
// equivoca de día durante cinco horas cada noche, que es la fuente de bugs
// más cara de este proyecto.

const OFFSET_HORAS = -5;

export const HORA_CIERRE = 23;
export const MINUTO_CIERRE = 59;

/** Cuánto hay que retroceder desde el final del día para llegar al cierre. */
const CIERRE_MS = (HORA_CIERRE * 60 + MINUTO_CIERRE) * 60_000;

/** Para escribirlo en pantalla sin que cada lugar arme su propia frase. */
export const ETIQUETA_CIERRE = `${HORA_CIERRE}:${String(MINUTO_CIERRE).padStart(2, "0")} de Ecuador`;

/**
 * El último día cuyo cierre de las 23:59 de Ecuador ya pasó, como marca de día
 * a medianoche UTC — el mismo formato con el que se guarda `DailyReport.date`
 * y los `MetricSnapshot`.
 *
 * La cuenta es una sola resta: se lleva el instante actual a hora de Ecuador y
 * se le restan las 23:59 del cierre; lo que queda cae dentro del día que toca
 * reportar. Escrito así aguanta que el reloj pase cada cinco minutos y que se
 * salte vueltas: a las 00:20 sigue devolviendo el día anterior, así que un
 * reporte que no salió a las 23:59 se genera igual apenas se puede en vez de
 * perderse hasta el día siguiente.
 *
 * Queda un minuto afuera —el reporte se arma a las 23:59 y el día termina a
 * las 23:59:59—, y es a propósito: tener el cierre esa misma noche vale más
 * que las ventas de ese minuto, y el rango del PDF igual cubre el día entero,
 * así que si algo entra a las 23:59:30 aparece cuando el PDF se regenere.
 */
export function diaDelReportePendiente(ahora: Date = new Date()): Date {
  const corrido = new Date(ahora.getTime() + OFFSET_HORAS * 3600_000 - CIERRE_MS);
  return new Date(
    Date.UTC(corrido.getUTCFullYear(), corrido.getUTCMonth(), corrido.getUTCDate())
  );
}

/**
 * El instante real en que se cierra un día. Sirve para decir en pantalla
 * cuándo sale el próximo reporte, en vez de que la pantalla afirme un horario
 * que después nadie verifica contra el código.
 */
export function instanteDeCierre(dia: Date): Date {
  return new Date(dia.getTime() - OFFSET_HORAS * 3600_000 + CIERRE_MS);
}

/**
 * El próximo cierre que viene, contando desde ahora. El del día pendiente ya
 * pasó por definición, así que el que sigue es siempre 24 horas después.
 */
export function proximoCierre(ahora: Date = new Date()): Date {
  return new Date(instanteDeCierre(diaDelReportePendiente(ahora)).getTime() + 24 * 3600_000);
}
