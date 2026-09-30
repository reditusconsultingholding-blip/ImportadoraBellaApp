/**
 * La fecha de una fila que llega de la planilla histórica, o null si no se lee.
 *
 * ESTO EXISTE POR TRES PIEZAS FECHADAS EN EL AÑO 2604.
 *
 * El importador hacía `new Date(`${fecha}T12:00:00.000Z`)` a secas, y
 * JavaScript acepta casi cualquier cosa sin quejarse. Una celda que decía
 * `2604` —26 de abril, escrito sin barra— se convirtió en el 1 de enero del
 * año 2604. Tres creativos de CIARA quedaron así desde la importación del 28
 * de agosto.
 *
 * Lo peligroso no fue que rompiera algo: no rompió nada. Las piezas
 * simplemente dejaron de existir para todos los reportes, porque ningún
 * período que alguien mire llega hasta el año 2604. Trabajo hecho, cargado, y
 * fuera de toda cuenta sin un solo error en ningún lado.
 *
 * Reglas:
 * - Solo AAAA-MM-DD. No se adivina un `2604` ni un `26/04`: adivinar el orden
 *   de día y mes es exactamente cómo una base termina llena de fechas dadas
 *   vuelta, y eso no avisa nunca.
 * - El año tiene que poder existir en esta operación.
 * - Lo que no pasa queda en null, y la fila se guarda con la fecha de
 *   importación igual que una celda vacía. "No sé cuándo fue" es más honesto
 *   que una fecha inventada que nadie va a ver jamás.
 */
export function fechaDeLaFila(crudo: string | null | undefined): Date | null {
  const texto = (crudo ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;

  const d = new Date(`${texto}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;

  // Un 2026-02-31 no existe: JavaScript lo corre al 3 de marzo sin avisar. Si
  // el día que salió no es el que entró, la celda estaba mal.
  if (d.toISOString().slice(0, 10) !== texto) return null;

  const anio = d.getUTCFullYear();
  if (anio < 2015 || anio > new Date().getUTCFullYear() + 1) return null;

  return d;
}
