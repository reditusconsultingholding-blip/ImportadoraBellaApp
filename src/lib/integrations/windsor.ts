import { fetchConReintentos, sinSecretos } from "@/lib/http";
// Cliente de Windsor.ai — la única puerta de entrada para Meta Ads y TikTok
// Ads. La decisión de pasar por aquí en vez de mantener dos integraciones
// separadas está en docs/DECISIONES.md: una sola credencial, un solo formato,
// y sobre todo evita la revisión de TikTok Business Center, que era el cuello
// de botella.
//
// La API de Windsor devuelve una fila por combinación de cuenta, campaña y
// día, con los campos que se le pidan.

const BASE_URL = "https://connectors.windsor.ai";

const COMMON_FIELDS = [
  "date",
  "account_id",
  "account_name",
  "campaign",
  "campaign_id",
  "spend",
  "impressions",
  "clicks",
] as const;

// Cada plataforma le pone otro nombre a lo mismo, y Windsor respeta el nombre
// original de cada una. Pedirle a TikTok los campos de Meta devuelve cero sin
// error — que es peor que fallar, porque parece que la campaña no vendió.
//
// Ojo con "total_complete_payment_rate": el nombre dice "rate" pero TikTok lo
// usa para el VALOR de las compras, no para una tasa.
const CONVERSION_FIELDS: Record<WindsorConnector, { purchases: string; value: string }> = {
  facebook: { purchases: "actions_purchase", value: "action_values_purchase" },
  tiktok: { purchases: "complete_payment", value: "total_complete_payment_rate" },
};

export type WindsorConnector = "facebook" | "tiktok";

export type WindsorRow = {
  date: string;
  account_id: string;
  account_name: string;
  campaign: string;
  campaign_id: string;
  spend: number;
  impressions: number;
  clicks: number;
  actions_purchase: number;
  action_values_purchase: number;
};

const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function hasWindsorKey() {
  return Boolean(process.env.WINDSOR_API_KEY?.trim());
}

/**
 * Trae las filas de un conector para los últimos `days` días.
 *
 * `datePreset` usa el formato de Windsor. Ojo con la T final: "last_7d"
 * devuelve los 7 días CERRADOS y deja afuera el de hoy, mientras que
 * "last_7dT" lo incluye. Con el primero, el panel mostraba gasto cero a
 * media tarde y parecía que nadie estaba pauteando. Se pide un
 * rango y no "todo": traer el histórico completo en cada corrida del cron
 * sería tirar cuota a la basura, y las filas se reescriben por clave, así que
 * volver a pedir los últimos días corrige cualquier dato que Meta haya
 * ajustado después (las compras se atribuyen con retraso).
 */
export async function fetchWindsorRows(
  connector: WindsorConnector,
  datePreset = "last_7dT"
): Promise<WindsorRow[]> {
  const apiKey = process.env.WINDSOR_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Falta WINDSOR_API_KEY. Se saca del panel de Windsor.ai.");
  }

  const conversion = CONVERSION_FIELDS[connector];
  const params = new URLSearchParams({
    api_key: apiKey,
    date_preset: datePreset,
    fields: [...COMMON_FIELDS, conversion.purchases, conversion.value].join(","),
  });

  // Tiempo límite holgado: el repaso semanal de 90 días de TikTok son más de
  // veinte mil filas y Windsor tarda en armarlas.
  const res = await fetchConReintentos(
    `${BASE_URL}/${connector}?${params.toString()}`,
    { headers: { Accept: "application/json" } },
    { timeoutMs: 180_000, reintentos: 3, esperaBaseMs: 2_000 },
  ).catch((err) => {
    // El mensaje de error no puede llevar la URL: tiene la api_key adentro.
    throw new Error(`Windsor.ai no respondió para ${connector}: ${sinSecretos(err instanceof Error ? err.message : String(err))}`);
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Windsor.ai respondió ${res.status} para ${connector}: ${sinSecretos(detail.slice(0, 300)) || "sin detalle"}`
    );
  }

  const json = (await res.json()) as { data?: unknown[] } | unknown[];
  // Windsor devuelve {data:[...]}; se acepta también un array pelado por si
  // cambian el envoltorio.
  const rows = Array.isArray(json) ? json : (json.data ?? []);

  return (rows as Record<string, unknown>[])
    .filter((r) => r && typeof r === "object" && r.campaign_id)
    .map((r) => ({
      date: String(r.date ?? "").slice(0, 10),
      account_id: String(r.account_id ?? ""),
      account_name: String(r.account_name ?? "Cuenta sin nombre"),
      campaign: String(r.campaign ?? "Campaña sin nombre"),
      campaign_id: String(r.campaign_id ?? ""),
      spend: num(r.spend),
      impressions: num(r.impressions),
      clicks: num(r.clicks),
      // Se normalizan al mismo nombre para que el resto de la app no tenga
      // que saber de qué plataforma vino la fila.
      actions_purchase: num(r[conversion.purchases]),
      action_values_purchase: num(r[conversion.value]),
    }))
    .filter((r) => r.date && r.account_id);
}

/* ------------------------------- Anuncios -------------------------------- */

export type WindsorAdRow = {
  date: string;
  account_id: string;
  campaign_id: string;
  ad_id: string;
  ad_name: string;
  grupo: string | null;
  miniatura: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
};

// Los campos de anuncio que se piden, del más completo al mínimo.
//
// Windsor rechaza la consulta entera si un campo no existe para el conector, y
// los nombres del conjunto y de la miniatura no son los mismos en Meta y en
// TikTok. Por eso se prueba primero con todo y, si falla, con menos: sin
// miniatura el anuncio se ve igual, sin anuncio no hay nada que mostrar.
const CAMPOS_ANUNCIO: Record<WindsorConnector, string[][]> = {
  facebook: [
    ["ad_id", "ad_name", "adset_name", "thumbnail_url"],
    ["ad_id", "ad_name", "adset_name"],
    ["ad_id", "ad_name"],
  ],
  tiktok: [
    ["ad_id", "ad_name", "ad_group_name", "video_thumbnail_url"],
    ["ad_id", "ad_name", "adgroup_name"],
    ["ad_id", "ad_name"],
  ],
};

/** Las filas por anuncio y día. Devuelve también qué juego de campos anduvo. */
export async function fetchWindsorAdRows(
  connector: WindsorConnector,
  datePreset = "last_7dT",
): Promise<{ filas: WindsorAdRow[]; campos: string[] }> {
  const apiKey = process.env.WINDSOR_API_KEY?.trim();
  if (!apiKey) throw new Error("Falta WINDSOR_API_KEY.");
  const conversion = CONVERSION_FIELDS[connector];

  let ultimoError = "";
  for (const extra of CAMPOS_ANUNCIO[connector]) {
    const params = new URLSearchParams({
      api_key: apiKey,
      date_preset: datePreset,
      fields: ["date", "account_id", "campaign_id", ...extra, "spend", "impressions", "clicks", conversion.purchases, conversion.value].join(","),
    });
    const res = await fetchConReintentos(
      `${BASE_URL}/${connector}?${params.toString()}`,
      { headers: { Accept: "application/json" } },
      { timeoutMs: 180_000, reintentos: 2, esperaBaseMs: 2_000 },
    ).catch((err) => {
      throw new Error(`Windsor.ai no respondió para anuncios de ${connector}: ${sinSecretos(err instanceof Error ? err.message : String(err))}`);
    });
    if (!res.ok) {
      ultimoError = `${res.status}: ${sinSecretos((await res.text().catch(() => "")).slice(0, 200))}`;
      continue;
    }
    const json = (await res.json()) as { data?: unknown[] } | unknown[];
    const rows = (Array.isArray(json) ? json : (json.data ?? [])) as Record<string, unknown>[];
    const grupoCampo = extra.find((c) => /adset|group/.test(c));
    const miniCampo = extra.find((c) => /thumbnail/.test(c));
    const filas = rows
      .filter((r) => r && typeof r === "object" && r.ad_id && r.campaign_id)
      .map((r) => ({
        date: String(r.date ?? "").slice(0, 10),
        account_id: String(r.account_id ?? ""),
        campaign_id: String(r.campaign_id ?? ""),
        ad_id: String(r.ad_id),
        ad_name: String(r.ad_name ?? "Anuncio sin nombre"),
        grupo: grupoCampo && r[grupoCampo] ? String(r[grupoCampo]) : null,
        miniatura: miniCampo && typeof r[miniCampo] === "string" && /^https:\/\//.test(r[miniCampo] as string)
          ? (r[miniCampo] as string)
          : null,
        spend: num(r.spend),
        impressions: num(r.impressions),
        clicks: num(r.clicks),
        purchases: num(r[conversion.purchases]),
        revenue: num(r[conversion.value]),
      }))
      .filter((r) => r.date && r.account_id);
    return { filas, campos: extra };
  }
  throw new Error(`Windsor.ai rechazó los campos de anuncio de ${connector} (${ultimoError}).`);
}
