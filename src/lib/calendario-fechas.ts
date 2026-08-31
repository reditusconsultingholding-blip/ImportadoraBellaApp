// Las fechas del calendario de eventos.
//
// El servidor corre en UTC y el negocio es de Ecuador (UTC-5). Es la misma
// distinción que ya resuelven `src/lib/date-range.ts` para los rangos del panel
// y `src/app/dashboard/chat/dias.ts` para los separadores del chat, y acá pesa
// todavía más: un evento del "1 de septiembre" guardado como
// 2026-09-01T00:00:00Z se lee de vuelta como las 19:00 del 31 de agosto en
// Guayaquil, y el calendario lo pinta un día antes.
//
// La regla, una sola: en la base se guarda el INSTANTE real; el día y la hora
// que escribe la persona son hora de pared ecuatoriana y se convierten en el
// SERVIDOR. El navegador nunca hace la cuenta — si la hiciera, alguien
// mirando el panel desde México crearía los eventos corridos.
//
// Ecuador no tiene horario de verano, así que un desplazamiento fijo alcanza.
const OFFSET_HORAS = -5;

/** Un día ecuatoriano, como "2026-09-01". */
export type DiaEc = string;

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const esDiaValido = (v: string | null | undefined): v is DiaEc =>
  typeof v === "string" && DIA_RE.test(v);

export const esHoraValida = (v: string | null | undefined) =>
  typeof v === "string" && HORA_RE.test(v);

/** El día ecuatoriano al que pertenece un instante. */
export function claveDiaEc(instante: Date | string): DiaEc {
  const d = typeof instante === "string" ? new Date(instante) : instante;
  return new Date(d.getTime() + OFFSET_HORAS * 3600_000).toISOString().slice(0, 10);
}

/** La hora ecuatoriana de un instante, como "14:30". */
export function horaEcDe(instante: Date | string): string {
  const d = typeof instante === "string" ? new Date(instante) : instante;
  return new Date(d.getTime() + OFFSET_HORAS * 3600_000).toISOString().slice(11, 16);
}

/**
 * El instante real que corresponde a un día (y opcionalmente una hora) de
 * Ecuador. Sin hora se toma la medianoche ecuatoriana, que es cómo se guarda
 * un evento de todo el día.
 *
 * Devuelve null si el texto no tiene la forma esperada, para que la ruta pueda
 * contestar "esa fecha no sirve" en vez de guardar un Invalid Date.
 */
export function instanteDeDiaEc(dia: string, hora?: string | null): Date | null {
  if (!esDiaValido(dia)) return null;
  const hhmm = hora && esHoraValida(hora) ? hora : "00:00";
  if (hora && !esHoraValida(hora)) return null;
  const base = Date.parse(`${dia}T${hhmm}:00.000Z`);
  if (Number.isNaN(base)) return null;
  // El instante en UTC está CINCO HORAS DESPUÉS de la misma hora de pared en
  // Guayaquil: las 00:00 del 1 de septiembre allá son las 05:00 UTC.
  return new Date(base - OFFSET_HORAS * 3600_000);
}

/** El mes ecuatoriano de hoy, como { anio, mes } con el mes de 1 a 12. */
export function mesActualEc() {
  const hoy = claveDiaEc(new Date());
  return { anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) };
}

/**
 * Lee un mes escrito como "2026-09". Si viene vacío o mal formado se cae al
 * mes corriente en vez de romper la pantalla.
 */
export function parsearMes(raw: string | null | undefined) {
  if (raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
    return { anio: Number(raw.slice(0, 4)), mes: Number(raw.slice(5, 7)) };
  }
  return mesActualEc();
}

export const claveMes = (anio: number, mes: number) =>
  `${anio}-${String(mes).padStart(2, "0")}`;

/** El mes anterior y el siguiente, para los botones de navegación. */
export function mesCorrido(anio: number, mes: number, pasos: number) {
  const total = anio * 12 + (mes - 1) + pasos;
  return { anio: Math.floor(total / 12), mes: (total % 12) + 1 };
}

/**
 * El par de instantes que encierra un mes ecuatoriano: desde la medianoche del
 * día 1 en Guayaquil hasta la medianoche del día 1 del mes siguiente.
 *
 * `hasta` es exclusivo a propósito. Con un "último instante del mes" habría que
 * elegir si termina en :59.999 y un evento guardado en el milisegundo de más
 * quedaría fuera de los dos meses.
 */
export function limitesDelMesEc(anio: number, mes: number) {
  const desde = new Date(Date.UTC(anio, mes - 1, 1) - OFFSET_HORAS * 3600_000);
  const siguiente = mesCorrido(anio, mes, 1);
  const hasta = new Date(
    Date.UTC(siguiente.anio, siguiente.mes - 1, 1) - OFFSET_HORAS * 3600_000
  );
  return { desde, hasta };
}

/** El arranque del día de hoy en Ecuador, para separar lo que ya pasó. */
export function arranqueDeHoyEc() {
  const hoy = claveDiaEc(new Date());
  return instanteDeDiaEc(hoy)!;
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "Septiembre 2026", para el encabezado del mes. */
export function etiquetaMes(anio: number, mes: number) {
  const nombre = MESES[mes - 1] ?? "";
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`;
}

/**
 * "Martes 1 de septiembre", para la lista de próximos.
 *
 * Se formatea a partir de las tres cifras del día, ya en hora ecuatoriana, y no
 * con `toLocaleDateString` sobre el instante: ese usaría la zona de quien mira
 * y el mismo evento diría cosas distintas en Guayaquil y en Bogotá.
 */
export function etiquetaDiaEc(dia: DiaEc, incluirAnio = false) {
  const [a, m, d] = dia.split("-").map(Number);
  const semana = new Date(Date.UTC(a, m - 1, d)).toLocaleDateString("es-EC", {
    weekday: "long",
    timeZone: "UTC",
  });
  const cabeza = `${semana.charAt(0).toUpperCase()}${semana.slice(1)}`;
  return `${cabeza} ${d} de ${MESES[m - 1]}${incluirAnio ? ` de ${a}` : ""}`;
}

/**
 * Las seis semanas de la rejilla del mes, empezando en lunes.
 *
 * Cada casilla trae su día ecuatoriano y si pertenece al mes que se está
 * mirando: los días de relleno se pintan apagados en vez de dejarse en blanco,
 * porque un evento del 31 de agosto que cae en la primera fila de septiembre
 * conviene poder verlo.
 *
 * Es aritmética de calendario pura sobre componentes de fecha, sin zonas de por
 * medio, así que da lo mismo en el servidor y en el navegador.
 */
export function rejillaDelMes(anio: number, mes: number): { dia: DiaEc; delMes: boolean }[][] {
  const primero = new Date(Date.UTC(anio, mes - 1, 1));
  // getUTCDay() devuelve 0 para domingo; acá la semana arranca el lunes, que es
  // como el equipo lee un calendario.
  const corrimiento = (primero.getUTCDay() + 6) % 7;
  const arranque = new Date(Date.UTC(anio, mes - 1, 1 - corrimiento));

  const semanas: { dia: DiaEc; delMes: boolean }[][] = [];
  for (let s = 0; s < 6; s++) {
    const fila: { dia: DiaEc; delMes: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const casilla = new Date(arranque.getTime() + (s * 7 + d) * 86_400_000);
      fila.push({
        dia: casilla.toISOString().slice(0, 10),
        delMes: casilla.getUTCMonth() === mes - 1 && casilla.getUTCFullYear() === anio,
      });
    }
    semanas.push(fila);
  }
  return semanas;
}

/** Un evento tal como lo consume la pantalla: ya resuelto a día y hora de Ecuador. */
export type EventoVista = {
  id: string;
  titulo: string;
  descripcion: string | null;
  lugar: string | null;
  /** Día ecuatoriano de arranque, "2026-09-01". */
  dia: DiaEc;
  /** "14:30", o null cuando el evento es de todo el día. */
  hora: string | null;
  /** Día ecuatoriano de fin, cuando el evento tiene fin. */
  diaFin: DiaEc | null;
  horaFin: string | null;
  todoElDia: boolean;
  creadoPor: { id: string; name: string };
  /** Si quien mira puede borrarlo: es dueño del evento o es dirección. */
  puedeBorrar: boolean;
};
