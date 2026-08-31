// Cómo se corta el día en el chat.
//
// El día es el de ECUADOR (UTC-5), no el del navegador de quien mira. Antes
// esto salía de `toLocaleDateString` sin zona: para Fabrizio en Guayaquil el
// separador decía una fecha y para alguien mirando el panel desde México otra,
// sobre los mismos mensajes. Es la misma distinción que hace
// `src/lib/date-range.ts` con los rangos del panel, y por el mismo motivo.
//
// Ecuador no tiene horario de verano, así que un desplazamiento fijo alcanza:
// se corre el instante 5 horas y después se lee y se formatea en UTC, que a
// esa altura ya es la hora de pared ecuatoriana.
const OFFSET_HORAS = -5;

function enEcuador(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(d.getTime() + OFFSET_HORAS * 3600_000);
}

/** El día ecuatoriano al que pertenece un instante, como "2026-08-30". */
export function claveDia(iso: string | Date) {
  return enEcuador(iso).toISOString().slice(0, 10);
}

/**
 * El título del separador: "Hoy", "Ayer" o "Miércoles, 26 de agosto".
 *
 * El año solo aparece cuando no es el corriente; ponerlo siempre alarga la
 * línea con el dato que menos falta hace.
 */
export function etiquetaDia(iso: string, ahora: Date = new Date()) {
  const dia = claveDia(iso);
  if (dia === claveDia(ahora)) return "Hoy";
  if (dia === claveDia(new Date(ahora.getTime() - 86_400_000))) return "Ayer";

  const d = enEcuador(iso);
  const mismoAno = d.getUTCFullYear() === enEcuador(ahora).getUTCFullYear();
  const texto = d.toLocaleDateString("es-EC", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    ...(mismoAno ? {} : { year: "numeric" }),
  });
  // El locale devuelve el día en minúscula ("miércoles, 26 de agosto"); en un
  // rótulo suelto, al lado de "Hoy" y "Ayer", queda mejor con mayúscula.
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * La hora del mensaje, como "14:32".
 *
 * En 24 horas y no con el "a. m." / "p. m." que trae el locale: al lado de
 * cada nombre, en letra chica, esas cuatro cifras se leen de un vistazo y
 * ocupan siempre lo mismo.
 */
export function horaEc(iso: string) {
  return enEcuador(iso).toLocaleTimeString("es-EC", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

/** Día y hora completos, para los textos que aparecen al pasar el mouse. */
export function fechaHoraEc(iso: string) {
  const d = enEcuador(iso);
  return `${d.toLocaleDateString("es-EC", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })}, ${horaEc(iso)}`;
}

// Cuánto silencio hace falta para que un mensaje deje de ser "lo mismo que
// venía diciendo" y arranque un bloque nuevo.
//
// Cinco minutos: dentro de esa ventana la persona sigue en el mismo turno de
// conversación —parte una idea en tres líneas— y repetir foto, nombre y hora
// en cada una es ruido. Pasados los cinco, el mensaje ya suele ser otra cosa
// (volvió después de hacer algo, contesta a otra persona) y ahí la hora y el
// nombre vuelven a ser información útil, no adorno.
const VENTANA_MS = 5 * 60_000;

type ParaAgrupar = {
  createdAt: string;
  author: { id: string };
  replyTo: unknown;
};

/**
 * Si este mensaje se pega al anterior en vez de abrir bloque propio.
 *
 * Una respuesta citada nunca se pega: arrastra encima la cita de otra persona
 * y pegada al mensaje anterior se lee como si fuera parte de él.
 */
export function esContinuacion(previo: ParaAgrupar | undefined, actual: ParaAgrupar) {
  if (!previo) return false;
  if (actual.replyTo) return false;
  if (previo.author.id !== actual.author.id) return false;
  if (claveDia(previo.createdAt) !== claveDia(actual.createdAt)) return false;
  return (
    new Date(actual.createdAt).getTime() - new Date(previo.createdAt).getTime() < VENTANA_MS
  );
}
