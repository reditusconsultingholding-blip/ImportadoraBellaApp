// Llamadas a APIs de terceros con tiempo límite y reintentos.
//
// Por qué: un fetch sin tiempo límite contra un proveedor colgado deja la
// corrida del reloj esperando para siempre, con el candado puesto; y un 502
// pasajero de Windsor tiraba la sincronización entera de esa vuelta. Ahora:
//
// - Cada intento tiene un tiempo límite (AbortSignal.timeout).
// - Se reintenta SOLO lo que tiene sentido reintentar: errores de red, 408,
//   429 y 5xx. Un 400 o un 401 no se arreglan insistiendo.
// - La espera crece al doble en cada vuelta (1s, 2s, 4s…) con un poco de azar,
//   para no golpear todos a la vez, y respeta Retry-After si el proveedor lo
//   manda.

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type OpcionesReintento = {
  /** Reintentos después del primer intento. Por defecto 3. */
  reintentos?: number;
  /** Tiempo límite de CADA intento, en ms. Por defecto 30 s. */
  timeoutMs?: number;
  /** Espera base del backoff, en ms. Por defecto 1 s. */
  esperaBaseMs?: number;
};

const REINTENTABLE = (s: number) => s === 408 || s === 429 || s >= 500;

function esperaDe(res: Response | null, intento: number, base: number) {
  const ra = res?.headers.get("retry-after");
  if (ra) {
    const seg = Number(ra);
    if (Number.isFinite(seg)) return Math.min(seg * 1000, 60_000);
    const fecha = Date.parse(ra);
    if (Number.isFinite(fecha)) return Math.min(Math.max(0, fecha - Date.now()), 60_000);
  }
  return base * 2 ** intento + Math.random() * base;
}

export async function fetchConReintentos(
  url: string,
  init: RequestInit = {},
  opciones: OpcionesReintento = {},
): Promise<Response> {
  const { reintentos = 3, timeoutMs = 30_000, esperaBaseMs = 1_000 } = opciones;

  for (let intento = 0; ; intento++) {
    let res: Response | null = null;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (!REINTENTABLE(res.status) || intento >= reintentos) return res;
      // Se descarta el cuerpo para liberar la conexión antes de esperar.
      await res.body?.cancel().catch(() => {});
    } catch (err) {
      if (intento >= reintentos) throw err;
    }
    await dormir(esperaDe(res, intento, esperaBaseMs));
  }
}

/** Saca de un texto cualquier api_key/token que venga en una URL o un cuerpo. */
export function sinSecretos(texto: string): string {
  return texto.replace(/((?:api_key|apikey|token|access_token|key)=)[^&\s"']+/gi, "$1***");
}
