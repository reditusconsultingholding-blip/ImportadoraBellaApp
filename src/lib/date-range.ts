// Rangos de fecha del Panel. Viven acá y no en la pantalla porque los usan
// también el análisis y, más adelante, los reportes.

export type RangeId =
  | "hoy"
  | "ayer"
  | "7d"
  | "30d"
  | "3m"
  | "6m"
  | "9m"
  | "12m"
  | "personalizado";

export const RANGES: { id: RangeId; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "7d", label: "Últimos 7 días" },
  { id: "30d", label: "Últimos 30 días" },
  { id: "3m", label: "Últimos 3 meses" },
  { id: "6m", label: "Últimos 6 meses" },
  { id: "9m", label: "Últimos 9 meses" },
  { id: "12m", label: "Últimos 12 meses" },
  { id: "personalizado", label: "Entre dos fechas" },
];

export type Range = { from: Date; to: Date; label: string; id: RangeId };

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Ecuador es UTC-5 todo el año (no tienen horario de verano), así que "hoy"
// para Fabrizio empieza a las 05:00 UTC. Sin este ajuste, entre medianoche y
// las 5 de la mañana el panel mostraría el día equivocado.
const OFFSET_HOURS = -5;

function localToday() {
  const now = new Date();
  const local = new Date(now.getTime() + OFFSET_HOURS * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

function endOf(day: Date) {
  const d = new Date(day);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function monthsBack(from: Date, months: number) {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

const prettyDay = (d: Date) =>
  d.toLocaleDateString("es-EC", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Resuelve el rango pedido. `desde`/`hasta` solo se miran cuando el id es
 * "personalizado"; si vienen mal formados se cae a los últimos 30 días en vez
 * de romper la pantalla.
 */
export function resolveRange(
  id: string | undefined,
  desde?: string,
  hasta?: string
): Range {
  const today = localToday();

  const make = (from: Date, to: Date, label: string, rid: RangeId): Range => ({
    from,
    to: endOf(to),
    label,
    id: rid,
  });

  switch (id) {
    case "hoy":
      return make(today, today, "Hoy", "hoy");
    case "ayer": {
      const y = new Date(today);
      y.setUTCDate(y.getUTCDate() - 1);
      return make(y, y, "Ayer", "ayer");
    }
    case "7d": {
      const f = new Date(today);
      f.setUTCDate(f.getUTCDate() - 6);
      return make(f, today, "Últimos 7 días", "7d");
    }
    case "3m":
      return make(monthsBack(today, 3), today, "Últimos 3 meses", "3m");
    case "6m":
      return make(monthsBack(today, 6), today, "Últimos 6 meses", "6m");
    case "9m":
      return make(monthsBack(today, 9), today, "Últimos 9 meses", "9m");
    case "12m":
      return make(monthsBack(today, 12), today, "Últimos 12 meses", "12m");
    case "personalizado": {
      const valid = (v?: string) => v && /^\d{4}-\d{2}-\d{2}$/.test(v);
      if (valid(desde) && valid(hasta)) {
        let from = new Date(`${desde}T00:00:00.000Z`);
        let to = new Date(`${hasta}T00:00:00.000Z`);
        // Si las dan al revés se ordenan solas, en vez de devolver vacío y
        // que parezca que no hay datos.
        if (from > to) [from, to] = [to, from];
        return make(from, to, `${prettyDay(from)} — ${prettyDay(to)}`, "personalizado");
      }
      // "Un día específico": solo se eligió una fecha.
      if (valid(desde)) {
        const d = new Date(`${desde}T00:00:00.000Z`);
        return make(d, d, prettyDay(d), "personalizado");
      }
      break;
    }
  }

  const f = new Date(today);
  f.setUTCDate(f.getUTCDate() - 29);
  return make(f, today, "Últimos 30 días", "30d");
}

export const rangeToParams = (range: Range) =>
  range.id === "personalizado"
    ? `rango=personalizado&desde=${isoDay(range.from)}&hasta=${isoDay(range.to)}`
    : `rango=${range.id}`;

export const toInputValue = isoDay;
