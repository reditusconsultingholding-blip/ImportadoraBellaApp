import { NextResponse, type NextRequest } from "next/server";

// Límite de frecuencia en memoria, compartido por las rutas que cuestan algo:
// las que prueban contraseñas, las que llaman a la IA (cada mensaje es plata)
// y las que mandan correos o salen a APIs de terceros.
//
// Vive en memoria del proceso a propósito. La app corre en una sola instancia
// de Railway: una tabla en memoria responde en microsegundos y no suma una
// dependencia (Redis) que haya que pagar y mantener. Se pierde en cada
// reinicio, y está bien: es un freno, no una contabilidad. Si algún día hay
// varias instancias, esto pasa a Redis o a la base.

type Ventana = { cuenta: number; desde: number };
const ventanas = new Map<string, Ventana>();

function barrer(ahora: number) {
  if (ventanas.size < 10_000) return;
  for (const [k, v] of ventanas) if (ahora - v.desde > 60 * 60 * 1000) ventanas.delete(k);
}

/**
 * La IP del cliente.
 *
 * El proxy de Railway AGREGA la IP real al final de X-Forwarded-For; lo que
 * venga antes lo escribió el cliente y puede ser cualquier cosa. Tomar el
 * primer valor —como se hacía— permitía saltarse el freno de login mandando
 * una IP inventada distinta en cada intento.
 */
export function ipDe(req: NextRequest | Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const partes = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (partes.length) return partes[partes.length - 1];
  }
  return req.headers.get("x-real-ip") ?? "sin-ip";
}

/** Suma un intento a `clave`. Devuelve cuánto esperar si se pasó del máximo. */
export function contar(clave: string, max: number, ventanaMs: number): { ok: true } | { ok: false; esperaSeg: number } {
  const ahora = Date.now();
  barrer(ahora);
  const v = ventanas.get(clave);
  if (!v || ahora - v.desde > ventanaMs) {
    ventanas.set(clave, { cuenta: 1, desde: ahora });
    return { ok: true };
  }
  v.cuenta += 1;
  if (v.cuenta > max) return { ok: false, esperaSeg: Math.ceil((v.desde + ventanaMs - ahora) / 1000) };
  return { ok: true };
}

/** Sin sumar: si `clave` ya está por encima del máximo. */
export function excedido(clave: string, max: number, ventanaMs: number): boolean {
  const v = ventanas.get(clave);
  return !!v && Date.now() - v.desde <= ventanaMs && v.cuenta >= max;
}

export function demasiados(esperaSeg: number) {
  const min = Math.max(1, Math.ceil(esperaSeg / 60));
  return NextResponse.json(
    { error: `Demasiados pedidos seguidos. Prueba de nuevo en ${min} minuto${min === 1 ? "" : "s"}.` },
    { status: 429, headers: { "Retry-After": String(esperaSeg) } },
  );
}

/**
 * Atajo para una ruta: cuenta por usuario (o por IP si no hay sesión) y
 * devuelve la respuesta 429 lista, o null si puede seguir.
 */
export function frenar(req: NextRequest | Request, ruta: string, quien: string | null, max: number, ventanaMs: number) {
  const r = contar(`${ruta}|${quien ?? ipDe(req)}`, max, ventanaMs);
  return r.ok ? null : demasiados(r.esperaSeg);
}

/** Igual que `frenar`, para rutas con sesión: cuenta por usuario. */
export function frenarUsuario(ruta: string, userId: string, max: number, ventanaMs: number) {
  const r = contar(`${ruta}|${userId}`, max, ventanaMs);
  return r.ok ? null : demasiados(r.esperaSeg);
}
