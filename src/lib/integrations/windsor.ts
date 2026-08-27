// Cliente de Windsor.ai — la única puerta de entrada para Meta Ads y TikTok
// Ads. La decisión de pasar por acá en vez de mantener dos integraciones
// separadas está en docs/DECISIONES.md: una sola credencial, un solo formato,
// y sobre todo evita la revisión de TikTok Business Center, que era el cuello
// de botella.
//
// La API de Windsor devuelve una fila por combinación de cuenta, campaña y
// día, con los campos que se le pidan.

const BASE_URL = "https://connectors.windsor.ai";

// Los nombres de campo son los que expone Windsor para estos conectores.
// Meta llama "actions_purchase" a las compras y "action_values_purchase" al
// valor de esas compras.
const FIELDS = [
  "date",
  "account_id",
  "account_name",
  "campaign",
  "campaign_id",
  "spend",
  "impressions",
  "clicks",
  "actions_purchase",
  "action_values_purchase",
] as const;

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
 * `datePreset` usa el formato de Windsor ("last_7d", "last_30d"). Se pide un
 * rango y no "todo": traer el histórico completo en cada corrida del cron
 * sería tirar cuota a la basura, y las filas se reescriben por clave, así que
 * volver a pedir los últimos días corrige cualquier dato que Meta haya
 * ajustado después (las compras se atribuyen con retraso).
 */
export async function fetchWindsorRows(
  connector: WindsorConnector,
  datePreset = "last_7d"
): Promise<WindsorRow[]> {
  const apiKey = process.env.WINDSOR_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Falta WINDSOR_API_KEY. Se saca del panel de Windsor.ai.");
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    date_preset: datePreset,
    fields: FIELDS.join(","),
  });

  const res = await fetch(`${BASE_URL}/${connector}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Windsor.ai respondió ${res.status} para ${connector}: ${detail.slice(0, 300) || "sin detalle"}`
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
      actions_purchase: num(r.actions_purchase),
      action_values_purchase: num(r.action_values_purchase),
    }))
    .filter((r) => r.date && r.account_id);
}
