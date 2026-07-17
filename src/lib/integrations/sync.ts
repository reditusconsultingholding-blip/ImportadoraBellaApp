import { db } from "@/lib/db";
import { clientForAccount } from "./client";

// Trae campañas + métricas del día desde la plataforma real y las
// guarda como snapshot. Pensado para correr con un cron corto
// (cada pocos minutos) una vez estén conectadas las cuentas reales.
export async function syncAdAccount(adAccountId: string) {
  const account = await db.adAccount.findUniqueOrThrow({ where: { id: adAccountId } });
  const client = clientForAccount(account);

  const [remoteCampaigns, insights] = await Promise.all([
    client.listCampaigns(account.externalId),
    client.getInsights(account.externalId),
  ]);

  for (const rc of remoteCampaigns) {
    const campaign = await db.campaign.upsert({
      where: { adAccountId_externalId: { adAccountId: account.id, externalId: rc.externalId } },
      create: {
        adAccountId: account.id,
        externalId: rc.externalId,
        name: rc.name,
        status: rc.status,
        // El producto se asigna aparte, cuando el código del identificador
        // (ej. BAT-001) se detecta en rc.name — ver matchProductFromName.
      },
      update: { name: rc.name, status: rc.status },
    });

    const insight = insights.find((i) => i.campaignExternalId === rc.externalId);
    if (insight) {
      await db.metricSnapshot.create({
        data: {
          campaignId: campaign.id,
          spend: insight.spend,
          impressions: insight.impressions,
          clicks: insight.clicks,
          purchases: insight.purchases,
          revenue: insight.revenue,
        },
      });
    }
  }
}

export async function syncOrganization(organizationId: string) {
  const accounts = await db.adAccount.findMany({ where: { organizationId } });
  const results = await Promise.allSettled(accounts.map((a) => syncAdAccount(a.id)));
  return results.map((r, i) => ({
    adAccountId: accounts[i].id,
    ok: r.status === "fulfilled",
    error: r.status === "rejected" ? String(r.reason) : null,
  }));
}

// Fabrizio identifica cada producto con un código dentro del nombre de
// campaña (ej. "BAT-001 | Kit Batana | Conversiones CO"). Esto lo detecta.
export async function matchProductFromName(organizationId: string, campaignName: string) {
  const products = await db.product.findMany({ where: { organizationId } });
  return products.find((p) => campaignName.toUpperCase().includes(p.code.toUpperCase())) ?? null;
}
