import { db } from "@/lib/db";
import type { Platform } from "@/generated/prisma/client";

export type ProductMetric = {
  code: string;
  name: string;
  spend: number;
  purchases: number;
  revenue: number;
  clicks: number;
  impressions: number;
  cpa: number | null;
  cpaTarget: number;
  status: "ok" | "urgent";
};

export type Overview = {
  totalSpend: number;
  totalPurchases: number;
  totalRevenue: number;
  ctr: number;
  products: ProductMetric[];
  topProduct: ProductMetric | null;
  urgentProducts: ProductMetric[];
};

// Con datos reales, spend/clicks/etc. vienen de la última sincronización
// contra la Graph API / TikTok Business API (ver src/lib/integrations).
// Acá se toma el snapshot más reciente por campaña.
export async function getOverview(
  organizationId: string,
  platform: Platform
): Promise<Overview> {
  const campaigns = await db.campaign.findMany({
    where: { adAccount: { organizationId, platform } },
    include: {
      product: true,
      metrics: { orderBy: { capturedAt: "desc" }, take: 1 },
    },
  });

  const byProduct = new Map<string, ProductMetric>();

  for (const campaign of campaigns) {
    const snapshot = campaign.metrics[0];
    if (!snapshot || !campaign.product) continue;

    const key = campaign.product.code;
    const existing = byProduct.get(key) ?? {
      code: campaign.product.code,
      name: campaign.product.name,
      spend: 0,
      purchases: 0,
      revenue: 0,
      clicks: 0,
      impressions: 0,
      cpa: null,
      cpaTarget: campaign.product.cpaTarget,
      status: "ok" as const,
    };

    existing.spend += snapshot.spend;
    existing.purchases += snapshot.purchases;
    existing.revenue += snapshot.revenue;
    existing.clicks += snapshot.clicks;
    existing.impressions += snapshot.impressions;

    byProduct.set(key, existing);
  }

  const products = Array.from(byProduct.values()).map((p) => {
    const cpa = p.purchases > 0 ? p.spend / p.purchases : null;
    const status: "ok" | "urgent" = cpa !== null && cpa > p.cpaTarget ? "urgent" : "ok";
    return { ...p, cpa, status };
  });

  products.sort((a, b) => b.revenue - a.revenue);

  const totalSpend = products.reduce((s, p) => s + p.spend, 0);
  const totalPurchases = products.reduce((s, p) => s + p.purchases, 0);
  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
  const totalClicks = products.reduce((s, p) => s + p.clicks, 0);
  const totalImpressions = products.reduce((s, p) => s + p.impressions, 0);

  return {
    totalSpend,
    totalPurchases,
    totalRevenue,
    ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    products,
    topProduct: products[0] ?? null,
    urgentProducts: products.filter((p) => p.status === "urgent"),
  };
}
