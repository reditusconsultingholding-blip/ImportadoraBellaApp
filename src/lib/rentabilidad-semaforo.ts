// El semáforo de rentabilidad, sin nada que toque la base.
//
// Vive aparte de `rentabilidad.ts` a propósito. La tabla es un componente de
// navegador, y `rentabilidad.ts` importa `db` — o sea Prisma, y detrás el
// driver de Postgres, que quiere leer archivos del disco. Importar la función
// desde ahí arrastraba todo eso al paquete del navegador y el build fallaba
// con "Can't resolve 'fs'".
//
// Es la misma separación que ya existe entre `contenido-opciones.ts` y
// `contenido.ts`, por la misma razón.

/** El color de la fila. `null` cuando no hay con qué juzgarla. */
export type Semaforo = "bien" | "medio" | "mal" | null;

/** Cuánto margen sobre el equilibrio hace falta para pintar de verde. */
const HOLGURA_SANA = 0.85;

/**
 * Qué tan sano está un producto, para poder verlo sin leer la fila.
 *
 * Usa el MISMO criterio que las alertas diarias —CPA contra el punto de
 * equilibrio— a propósito: si el semáforo pintara de verde una fila que la
 * alerta manda apagar, la pantalla se contradiría sola y no se le creería a
 * ninguna de las dos.
 *
 * El escalón de "medio" está en el 85% del equilibrio: por debajo de eso el
 * producto todavía gana, pero cualquier subida de costo o caída de efectividad
 * lo pasa al rojo.
 */
export function semaforoDeFila(f: {
  gastoPauta: number;
  cpa: number | null;
  cpaBreakeven: number | null;
}): Semaforo {
  // Gastó sin una sola compra atribuida: es lo más urgente que hay.
  if (f.cpa == null) return f.gastoPauta > 0 ? "mal" : null;
  // Sin economía cargada no hay contra qué comparar. Se deja sin color en vez
  // de inventarle uno: un verde por falta de datos es peor que ningún color.
  if (f.cpaBreakeven == null) return null;
  if (f.cpa > f.cpaBreakeven) return "mal";
  if (f.cpa > f.cpaBreakeven * HOLGURA_SANA) return "medio";
  return "bien";
}
