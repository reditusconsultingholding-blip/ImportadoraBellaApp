import { fetchConReintentos, sinSecretos } from "@/lib/http";
import type { WindsorRow } from "./windsor";

// Meta Ads directo, sin pasar por Windsor.
//
// POR QUÉ (Fabrizio, 13-nov)
// Un mentor le mostró su plataforma: la conecta a Meta por la API, con todas
// las cuentas publicitarias compartidas a un Business Manager y una app creada
// ahí, y «lo tiene al día». Con Windsor, Meta llega con retraso —la foto se
// refresca cada 15 a 60 minutos según el plan— y cuando una cuenta se cae de
// Windsor (CP2 Top Ventas, 10-nov) se pierde el gasto hasta que alguien la
// reconecta. TikTok sigue por Windsor: la app de desarrollador de TikTok
// exige una revisión que nadie quiere hacer.
//
// CÓMO
// Un token de USUARIO DEL SISTEMA del Business Manager (no vence) con
// `ads_read`, y las cuentas publicitarias asignadas a ese usuario. Con eso,
// `/me/adaccounts` devuelve las cuentas y `/act_{id}/insights` el gasto y las
// compras por campaña y día. Las filas salen con la misma forma que las de
// Windsor, así que se guardan con el mismo código (windsor-sync.ts): las
// campañas, los enlaces a productos y las cuentas «vende por WhatsApp» siguen
// valiendo, porque el id de cuenta y de campaña es el mismo de Meta.

const VERSION = "v21.0";
const BASE = `https://graph.facebook.com/${VERSION}`;

/** Lo que Meta llama compra. Windsor usa el mismo `purchase` de `actions`. */
const TIPOS_COMPRA = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"];

type Accion = { action_type: string; value: string };

/** La compra de una fila: el primer tipo que traiga, en el orden de arriba. */
export function comprasDe(acciones?: Accion[]): number {
  for (const tipo of TIPOS_COMPRA) {
    const a = acciones?.find((x) => x.action_type === tipo);
    if (a) return Number(a.value) || 0;
  }
  return 0;
}

/** Hoy en Ecuador (UTC−5), como YYYY-MM-DD. */
function hoyEcuador(ahora = Date.now()): string {
  return new Date(ahora - 5 * 3600_000).toISOString().slice(0, 10);
}

function restarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * El rango de fechas que pide un preset de Windsor.
 *
 * `last_7dT` son los últimos 7 días contando hoy; `last_7d`, los 7 anteriores
 * a hoy. Así los mismos llamados que hoy van a Windsor sirven igual acá.
 */
export function rangoDePreset(preset: string, ahora = Date.now()): { since: string; until: string } {
  const hoy = hoyEcuador(ahora);
  const m = /^last_(\d+)([dwmy])(T?)$/.exec(preset);
  const n = m ? Number(m[1]) * ({ d: 1, w: 7, m: 30, y: 365 } as const)[m[2] as "d" | "w" | "m" | "y"] : 7;
  // Meta no da más de 37 meses de historia.
  const dias = Math.min(Math.max(n, 1), 1100);
  const conHoy = m ? m[3] === "T" : true;
  return conHoy
    ? { since: restarDias(hoy, dias - 1), until: hoy }
    : { since: restarDias(hoy, dias), until: restarDias(hoy, 1) };
}

async function pedir<T>(url: string): Promise<T> {
  const res = await fetchConReintentos(url, {}, { timeoutMs: 60_000, reintentos: 2 }).catch((err) => {
    // La URL lleva el token: nunca va al mensaje.
    throw new Error(`Meta no respondió: ${sinSecretos(err instanceof Error ? err.message : String(err))}`);
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok || json.error) {
    const e = json.error;
    // 190 = token vencido o revocado: es lo único que el cliente puede arreglar solo.
    if (e?.code === 190) throw new Error("Meta rechazó el token (vencido o revocado). Hay que generar uno nuevo.");
    throw new Error(`Meta respondió ${res.status}: ${sinSecretos(e?.message ?? "sin detalle")}`);
  }
  return json;
}

/** Recorre todas las páginas de un listado de la Graph API. */
async function todasLasPaginas<T>(primera: string): Promise<T[]> {
  const filas: T[] = [];
  let url: string | undefined = primera;
  // Tope de seguridad: 200 páginas de 500 son 100.000 filas.
  for (let i = 0; url && i < 200; i++) {
    const r: { data?: T[]; paging?: { next?: string } } = await pedir(url);
    filas.push(...(r.data ?? []));
    url = r.paging?.next;
  }
  return filas;
}

export type CuentaMeta = { id: string; nombre: string; estado: number };

/** Las cuentas publicitarias que ve el token. Sirve también para probarlo. */
export async function cuentasDelToken(token: string): Promise<CuentaMeta[]> {
  const url = `${BASE}/me/adaccounts?${new URLSearchParams({
    fields: "account_id,name,account_status",
    limit: "200",
    access_token: token,
  })}`;
  const filas = await todasLasPaginas<{ account_id: string; name: string; account_status: number }>(url);
  return filas.map((f) => ({ id: f.account_id, nombre: f.name, estado: f.account_status }));
}

type FilaInsight = {
  date_start: string;
  campaign_id: string;
  campaign_name: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: Accion[];
  action_values?: Accion[];
};

/** Convierte una fila de insights de Meta en la forma que ya sabe guardar Jarvis. */
export function aFilaComun(cuenta: { id: string; nombre: string }, f: FilaInsight): WindsorRow {
  return {
    date: f.date_start,
    account_id: cuenta.id,
    account_name: cuenta.nombre,
    campaign: f.campaign_name,
    campaign_id: f.campaign_id,
    spend: Number(f.spend ?? 0) || 0,
    impressions: Number(f.impressions ?? 0) || 0,
    clicks: Number(f.clicks ?? 0) || 0,
    actions_purchase: comprasDe(f.actions),
    action_values_purchase: comprasDe(f.action_values),
  };
}

/**
 * Gasto y compras por cuenta, campaña y día, directo de Meta.
 *
 * Se piden las cuentas de a cuatro a la vez: las trece de Fabrizio en serie
 * tardaban demasiado para una vuelta de pocos minutos, y todas juntas rozan
 * el límite de llamadas de la app.
 */
export async function filasDeMetaDirecto(token: string, preset = "last_7dT"): Promise<WindsorRow[]> {
  const cuentas = await cuentasDelToken(token);
  const { since, until } = rangoDePreset(preset);
  const salida: WindsorRow[] = [];
  const errores: string[] = [];

  const deUna = async (c: CuentaMeta) => {
    const url = `${BASE}/act_${c.id}/insights?${new URLSearchParams({
      level: "campaign",
      time_increment: "1",
      time_range: JSON.stringify({ since, until }),
      fields: "campaign_id,campaign_name,spend,impressions,clicks,actions,action_values",
      limit: "500",
      access_token: token,
    })}`;
    try {
      const filas = await todasLasPaginas<FilaInsight>(url);
      for (const f of filas) salida.push(aFilaComun({ id: c.id, nombre: c.nombre }, f));
    } catch (e) {
      errores.push(`${c.nombre}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  for (let i = 0; i < cuentas.length; i += 4) await Promise.all(cuentas.slice(i, i + 4).map(deUna));

  // Una cuenta que falla no tumba las demás, pero tampoco se calla: si fallan
  // todas, es el token o el permiso, y eso tiene que verse en rojo.
  if (cuentas.length > 0 && errores.length === cuentas.length) {
    throw new Error(`Meta no entregó ninguna cuenta. ${errores[0]}`);
  }
  if (errores.length) console.warn(`[meta-directo] ${errores.length} cuenta(s) con error: ${errores.join(" · ")}`);
  return salida;
}
