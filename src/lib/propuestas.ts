// El buzón del equipo: dudas, mejoras y errores que alguien manda desde la
// burbuja de ayuda, dictados o escritos. Ver model PropuestaEquipo.
//
// Acá queda solo lo que no toca la base (qué tipos y estados existen, cómo se
// limpia lo que llega), para poder probarlo sin servidor.

export const TIPOS_PROPUESTA = [
  { id: "MEJORA", texto: "Mejora", ayuda: "Algo que haría el trabajo más fácil o más rápido." },
  { id: "DUDA", texto: "Duda", ayuda: "Algo que no entiendes de una pantalla o de un número." },
  { id: "ERROR", texto: "Error", ayuda: "Algo que no funciona o da un número que no cuadra." },
] as const;

export type TipoPropuesta = (typeof TIPOS_PROPUESTA)[number]["id"];

export const ESTADOS_PROPUESTA = [
  { id: "NUEVA", texto: "Nueva" },
  { id: "EN_CURSO", texto: "En curso" },
  { id: "HECHA", texto: "Hecha" },
  { id: "DESCARTADA", texto: "Descartada" },
] as const;

export type EstadoPropuesta = (typeof ESTADOS_PROPUESTA)[number]["id"];

export const LARGO_MAXIMO = 4000;

export function esTipo(x: unknown): x is TipoPropuesta {
  return TIPOS_PROPUESTA.some((t) => t.id === x);
}

export function esEstado(x: unknown): x is EstadoPropuesta {
  return ESTADOS_PROPUESTA.some((e) => e.id === x);
}

export const textoDeTipo = (t: string) => TIPOS_PROPUESTA.find((x) => x.id === t)?.texto ?? t;
export const textoDeEstado = (e: string) => ESTADOS_PROPUESTA.find((x) => x.id === e)?.texto ?? e;

export type PropuestaNueva = {
  tipo: TipoPropuesta;
  texto: string;
  dictado: boolean;
  ruta: string | null;
  seccion: string | null;
};

/**
 * Valida lo que manda la pantalla. Devuelve el error en palabras para
 * mostrarlo tal cual, o la propuesta limpia.
 */
export function limpiarPropuesta(body: unknown): { error: string } | { ok: PropuestaNueva } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!esTipo(b.tipo)) return { error: "Elige si es una mejora, una duda o un error." };
  // El dictado deja espacios dobles y saltos sueltos.
  const texto = typeof b.texto === "string" ? b.texto.replace(/\s+/g, " ").trim() : "";
  if (texto.length < 5) return { error: "Cuéntalo con un poco más de detalle." };
  if (texto.length > LARGO_MAXIMO) return { error: `Es muy largo: máximo ${LARGO_MAXIMO} caracteres.` };
  const corto = (x: unknown, n: number) => (typeof x === "string" && x.trim() ? x.trim().slice(0, n) : null);
  // Solo rutas del panel: es un enlace que dirección va a abrir.
  const ruta = corto(b.ruta, 300);
  return {
    ok: {
      tipo: b.tipo,
      texto,
      dictado: b.dictado === true,
      ruta: ruta && ruta.startsWith("/dashboard") ? ruta : null,
      seccion: corto(b.seccion, 120),
    },
  };
}
