import type { AdPlatformClient, RemoteCampaign, RemoteInsight } from "./types";

const BASE = "https://business-api.tiktok.com/open_api/v1.3";

// `accessToken` es el token que devuelve el flujo OAuth de TikTok for
// Business una vez que Fabrizio autoriza la app en su Business Center.
// La app de TikTok Marketing API tiene que estar aprobada por TikTok
// antes de que esto funcione en producción (ver checklist de accesos).
// `advertiserId` se pasa aparte porque las llamadas de escritura de TikTok
// (pausar, reanudar, presupuesto) lo piden en el body, no solo en la query.
export function createTikTokClient(accessToken: string, advertiserId: string): AdPlatformClient {
  async function request(
    path: string,
    { method = "GET", query, body }: { method?: "GET" | "POST"; query?: Record<string, string>; body?: unknown } = {}
  ) {
    const url = new URL(`${BASE}${path}`);
    if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

    const res = await fetch(url.toString(), {
      method,
      headers: {
        "Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = await res.json();
    if (!res.ok || json.code !== 0) {
      throw new Error(`TikTok API error (${path}): ${JSON.stringify(json)}`);
    }
    return json;
  }

  return {
    async listCampaigns(advertiserId): Promise<RemoteCampaign[]> {
      const json = await request("/campaign/get/", {
        query: { advertiser_id: advertiserId },
      });
      type Row = { campaign_id: string; campaign_name: string; operation_status: string };
      return (json.data?.list ?? []).map((c: Row) => ({
        externalId: c.campaign_id,
        name: c.campaign_name,
        status: c.operation_status,
      }));
    },

    async getInsights(advertiserId): Promise<RemoteInsight[]> {
      const json = await request("/report/integrated/get/", {
        query: {
          advertiser_id: advertiserId,
          report_type: "BASIC",
          data_level: "AUCTION_CAMPAIGN",
          dimensions: JSON.stringify(["campaign_id"]),
          metrics: JSON.stringify([
            "spend",
            "impressions",
            "clicks",
            "conversion",
            "total_complete_payment_rate_value",
          ]),
          start_date: new Date().toISOString().slice(0, 10),
          end_date: new Date().toISOString().slice(0, 10),
        },
      });

      type Row = {
        dimensions: { campaign_id: string };
        metrics: {
          spend: string;
          impressions: string;
          clicks: string;
          conversion: string;
          total_complete_payment_rate_value: string;
        };
      };

      return (json.data?.list ?? []).map((row: Row) => ({
        campaignExternalId: row.dimensions.campaign_id,
        spend: Number(row.metrics.spend ?? 0),
        impressions: Number(row.metrics.impressions ?? 0),
        clicks: Number(row.metrics.clicks ?? 0),
        purchases: Number(row.metrics.conversion ?? 0),
        revenue: Number(row.metrics.total_complete_payment_rate_value ?? 0),
      }));
    },

    async pauseCampaign(campaignExternalId) {
      await request("/campaign/update/status/", {
        method: "POST",
        body: { advertiser_id: advertiserId, campaign_ids: [campaignExternalId], operation_status: "DISABLE" },
      });
    },

    async resumeCampaign(campaignExternalId) {
      await request("/campaign/update/status/", {
        method: "POST",
        body: { advertiser_id: advertiserId, campaign_ids: [campaignExternalId], operation_status: "ENABLE" },
      });
    },

    async setDailyBudget(campaignExternalId, dailyBudget) {
      await request("/campaign/update/", {
        method: "POST",
        body: { advertiser_id: advertiserId, campaign_id: campaignExternalId, budget: dailyBudget },
      });
    },
  };
}
