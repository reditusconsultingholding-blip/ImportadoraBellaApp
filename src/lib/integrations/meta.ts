import type { AdPlatformClient, RemoteCampaign, RemoteInsight } from "./types";

const GRAPH_VERSION = "v21.0";
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Cuenta de anuncios de Meta (Facebook + Instagram comparten la misma
// Marketing API). `accessToken` es el token de larga duración del
// Business Manager, una vez que Fabrizio nos agregue como partner.
export function createMetaClient(accessToken: string): AdPlatformClient {
  async function request(
    path: string,
    params: Record<string, string> = {},
    method: "GET" | "POST" = "GET"
  ) {
    let res: Response;
    if (method === "GET") {
      const url = new URL(`${BASE}${path}`);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      url.searchParams.set("access_token", accessToken);
      res = await fetch(url.toString());
    } else {
      const body = new URLSearchParams({ ...params, access_token: accessToken });
      res = await fetch(`${BASE}${path}`, { method: "POST", body });
    }

    const json = await res.json();
    if (!res.ok) {
      throw new Error(`Meta API error (${path}): ${JSON.stringify(json.error ?? json)}`);
    }
    return json;
  }

  return {
    async listCampaigns(adAccountExternalId): Promise<RemoteCampaign[]> {
      const body = await request(`/${adAccountExternalId}/campaigns`, {
        fields: "id,name,status",
      });
      return (body.data ?? []).map((c: { id: string; name: string; status: string }) => ({
        externalId: c.id,
        name: c.name,
        status: c.status,
      }));
    },

    async getInsights(adAccountExternalId): Promise<RemoteInsight[]> {
      const body = await request(`/${adAccountExternalId}/insights`, {
        level: "campaign",
        date_preset: "today",
        fields: "campaign_id,spend,impressions,clicks,actions,action_values",
      });

      type Action = { action_type: string; value: string };
      type Row = {
        campaign_id: string;
        spend?: string;
        impressions?: string;
        clicks?: string;
        actions?: Action[];
        action_values?: Action[];
      };

      const purchaseCount = (actions?: Action[]) =>
        Number(actions?.find((a) => a.action_type === "purchase")?.value ?? 0);
      const purchaseValue = (values?: Action[]) =>
        Number(values?.find((a) => a.action_type === "purchase")?.value ?? 0);

      return (body.data ?? []).map((row: Row) => ({
        campaignExternalId: row.campaign_id,
        spend: Number(row.spend ?? 0),
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
        purchases: purchaseCount(row.actions),
        revenue: purchaseValue(row.action_values),
      }));
    },

    async pauseCampaign(campaignExternalId) {
      await request(`/${campaignExternalId}`, { status: "PAUSED" }, "POST");
    },

    async resumeCampaign(campaignExternalId) {
      await request(`/${campaignExternalId}`, { status: "ACTIVE" }, "POST");
    },

    async setDailyBudget(campaignExternalId, dailyBudget) {
      // Meta espera el presupuesto en centavos.
      await request(
        `/${campaignExternalId}`,
        { daily_budget: String(Math.round(dailyBudget * 100)) },
        "POST"
      );
    },
  };
}
