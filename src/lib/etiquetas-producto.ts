// Las etiquetas de producto.
//
// Fabrizio, llamada del 10-nov: «poderle poner a cada producto una etiqueta de
// producto nuevo, producto permanente, activo, producto de testeo, producto a
// importar nuevamente, no importar, compra orgánica… y en cualquier parte yo
// pueda visualizar: este es testeo, este está activo, este está apagado».
//
// Son pocas y fijas a propósito: una lista abierta termina con "testeo",
// "Testeo" y "test" como tres etiquetas distintas, y la sección de testeos de
// la pantalla de riesgo deja de encontrarlos.

export const ETIQUETAS = [
  { id: "TESTEO", texto: "Testeo", clase: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  { id: "ACTIVO", texto: "Activo", clase: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  { id: "APAGADO", texto: "Apagado", clase: "border-zinc-500/40 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300" },
  { id: "PERMANENTE", texto: "Permanente", clase: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  { id: "NUEVO", texto: "Nuevo", clase: "border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" },
  { id: "REIMPORTAR", texto: "Volver a importar", clase: "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300" },
  { id: "NO_REIMPORTAR", texto: "No importar", clase: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  { id: "ORGANICO", texto: "Orgánico", clase: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
] as const;

export type EtiquetaId = (typeof ETIQUETAS)[number]["id"];

const IDS = new Set<string>(ETIQUETAS.map((e) => e.id));

/** Deja solo etiquetas conocidas, sin repetir, en el orden de la lista. */
export function limpiarEtiquetas(entrada: unknown): EtiquetaId[] {
  if (!Array.isArray(entrada)) return [];
  const pedidas = new Set(entrada.filter((e): e is string => typeof e === "string" && IDS.has(e)));
  return ETIQUETAS.map((e) => e.id).filter((id) => pedidas.has(id));
}

export function datosEtiqueta(id: string) {
  return ETIQUETAS.find((e) => e.id === id);
}
