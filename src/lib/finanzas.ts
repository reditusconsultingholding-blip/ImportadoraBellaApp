import { db } from "@/lib/db";
import { canViewFinancials } from "@/lib/permissions";
import { MOTIVO_CON_CIFRAS } from "@/lib/finanzas-textos";

/**
 * Si esta persona ve el dinero, preguntado a la BASE y no a la sesión.
 *
 * La sesión es un token firmado que dura 30 días. Si el permiso se leyera de
 * ahí, quitarle la facturación a alguien no tendría efecto hasta que volviera
 * a entrar: un mes entero viendo lo que ya no le corresponde. Es el mismo
 * criterio que usan el chat de Jarvis y el permiso de nómina.
 *
 * Se llama una vez por pantalla y se pasa hacia abajo: no hace falta repetir
 * la consulta por componente.
 */
export async function veLasCifras(userId: string): Promise<boolean> {
  const usuario = await db.user.findUnique({
    where: { id: userId },
    select: { canViewFinancials: true },
  });
  return canViewFinancials(usuario);
}

/**
 * Cualquier monto en dólares dentro de un texto.
 *
 * Se usa como red de contención sobre las notificaciones YA GUARDADAS. Desde
 * ahora cada aviso se escribe según quién lo va a recibir (ver
 * alertas-diarias.ts), pero en la base quedan meses de notificaciones que se
 * escribieron con los montos adentro, y esas no se pueden reescribir. Antes de
 * que la regla se caiga por una notificación vieja, se deja de mostrar.
 */
const LLEVA_PLATA = /\$\s*\d|\bUSD\b/;

export function esconderCifras(mensaje: string) {
  return LLEVA_PLATA.test(mensaje);
}

/** Las notificaciones que esta persona puede leer enteras. */
export function notificacionesVisibles<T extends { message: string }>(
  notificaciones: T[],
  verCifras: boolean
): T[] {
  if (verCifras) return notificaciones;
  return notificaciones.filter((n) => !esconderCifras(n.message));
}

/**
 * Un texto libre que puede traer montos adentro, listo para mostrar.
 *
 * Los motivos de una propuesta y las notas de quien decide son texto que
 * escribió una persona (o que armó el sistema cuando el proponente sí veía
 * las cifras): no se pueden reescribir después. Cuando llevan un monto se
 * reemplaza la frase entera, no se le tachan los números — media frase con
 * huecos se lee como un error, y una frase entera dice qué pasó y por qué.
 */
export function textoSinCifras(
  texto: string | null,
  verCifras: boolean,
  reemplazo = MOTIVO_CON_CIFRAS
): string | null {
  if (texto == null || verCifras || !esconderCifras(texto)) return texto;
  return reemplazo;
}

/**
 * Un requerimiento sin las dos cifras de plata que lleva cada pieza.
 *
 * El CPA y el CPM de un creativo son dólares igual que los del producto,
 * solo que cargados a mano desde el administrador de anuncios. Las columnas
 * y los campos que los muestran desaparecen para quien no ve dinero, y acá
 * se corta el dato en el servidor para que tampoco viaje.
 */
export function creativosSinCifras<T extends { cpa: number | null; cpm: number | null }>(
  filas: T[],
  verCifras: boolean
): T[] {
  if (verCifras) return filas;
  return filas.map((f) => ({ ...f, cpa: null, cpm: null }));
}

