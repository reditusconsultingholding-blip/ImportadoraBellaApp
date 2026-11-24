// La confirmación de los cambios que Jarvis hace desde el chat.
//
// Emilia, 23-nov: «un botón donde yo le hable a Jarvis y le diga: la cápsula de
// hongos es reishi, y él lo una». Hablarle para unir es cómodo, y por eso mismo
// peligroso: la base es la real, y un enlace mal hecho mete los pedidos de un
// producto dentro de otro sin que nadie lo note.
//
// Así que el chat NUNCA guarda en la misma vuelta en que propone. Primero
// muestra qué va a cambiar y entrega un código; el cambio solo se aplica si el
// código vuelve en un mensaje POSTERIOR de la persona. No se le pide al modelo
// que espere el «sí»: se le impide guardar sin él, porque el código emitido en
// esta respuesta no sirve dentro de esta misma respuesta.

export type CambioPropuesto =
  | { tipo: "shopify"; nombre: string; productId: string }
  | { tipo: "campana"; alias: string; productId: string };

type Pendiente = {
  cambio: CambioPropuesto;
  organizationId: string;
  userId: string;
  /** La respuesta del chat en que se propuso: en esa misma no se puede aplicar. */
  turno: string;
  vence: number;
};

const VIGENCIA_MS = 30 * 60 * 1000;
const pendientes = new Map<string, Pendiente>();

function limpiarVencidos(ahora: number) {
  for (const [k, p] of pendientes) if (p.vence < ahora) pendientes.delete(k);
}

/** Un código corto que se pueda decir en voz alta y no se adivine. */
function nuevoCodigo() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += letras[Math.floor(Math.random() * letras.length)];
  return s;
}

export function proponerCambio(
  datos: { organizationId: string; userId: string; turno: string; cambio: CambioPropuesto },
  ahora = Date.now(),
): string {
  limpiarVencidos(ahora);
  let codigo = nuevoCodigo();
  while (pendientes.has(codigo)) codigo = nuevoCodigo();
  pendientes.set(codigo, { ...datos, vence: ahora + VIGENCIA_MS });
  return codigo;
}

export type Confirmacion =
  | { ok: true; cambio: CambioPropuesto }
  | { ok: false; motivo: string };

/**
 * Devuelve el cambio si el código sirve, y lo consume: un código se usa una vez.
 *
 * Sirve solo para la misma persona y la misma empresa que lo pidió, antes de
 * que venza, y en una respuesta distinta de la que lo emitió.
 */
export function confirmarCambio(
  datos: { codigo: string; organizationId: string; userId: string; turno: string },
  ahora = Date.now(),
): Confirmacion {
  limpiarVencidos(ahora);
  const codigo = datos.codigo.trim().toUpperCase();
  const p = pendientes.get(codigo);
  if (!p || p.organizationId !== datos.organizationId || p.userId !== datos.userId) {
    return { ok: false, motivo: "Ese código no existe o ya venció. Hay que volver a proponer el cambio." };
  }
  if (p.turno === datos.turno) {
    return {
      ok: false,
      motivo:
        "No se aplicó: el cambio se acaba de proponer en esta misma respuesta. Muéstrale a la persona qué va a cambiar y espera a que diga que sí.",
    };
  }
  pendientes.delete(codigo);
  return { ok: true, cambio: p.cambio };
}

/** Un alias de campaña como lo guarda la ficha: mayúsculas, un espacio, de 3 a 60 letras. */
export function limpiarAlias(a: string): string | null {
  const t = a.replace(/\s+/g, " ").trim().toUpperCase();
  return t.length >= 3 && t.length <= 60 ? t : null;
}
