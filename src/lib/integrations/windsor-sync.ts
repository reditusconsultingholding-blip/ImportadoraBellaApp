import { db } from "@/lib/db";
import { fetchWindsorRows, type WindsorConnector, type WindsorRow } from "./windsor";
import type { Platform } from "@/generated/prisma/client";
import { parseCampaignRef } from "@/lib/product-code";

// Vuelca lo que trae Windsor en el modelo de la app: una AdAccount por cuenta
// publicitaria, una Campaign por campaña y un MetricSnapshot por campaña y día.

const PLATFORM: Record<WindsorConnector, Platform> = {
  facebook: "META",
  tiktok: "TIKTOK",
};

// A qué producto pertenece una campaña.
//
// Primero por el código del nombre (ver product-code.ts): las campañas se
// llaman "134142 / TE GINSENG / ABO / COST CAP" y ese 134142 es el mismo
// producto en Meta y en TikTok, aunque el nombre esté escrito distinto.
// Cubre el 96,6% del gasto.
//
// Para el resto queda el cruce por nombre, probando primero los más largos:
// si existieran "TE" y "TE GINSENG", el corto haría match con todo y ganaría
// el equivocado.
function matchProduct(
  campaignName: string,
  products: { id: string; code: string; name: string }[]
) {
  const ref = parseCampaignRef(campaignName);
  if (ref) {
    const porCodigo = products.find((p) => p.code === ref.code);
    if (porCodigo) return porCodigo.id;
  }

  const haystack = campaignName.toUpperCase();
  const ordered = [...products].sort((a, b) => b.name.length - a.name.length);

  for (const product of ordered) {
    if (product.code && haystack.includes(product.code.toUpperCase())) return product.id;
  }
  for (const product of ordered) {
    if (product.name.length >= 4 && haystack.includes(product.name.toUpperCase())) {
      return product.id;
    }
  }
  return null;
}

export async function syncWindsorConnector(
  organizationId: string,
  connector: WindsorConnector,
  datePreset = "last_7d"
) {
  const rows = await fetchWindsorRows(connector, datePreset);
  if (rows.length === 0) {
    return { accounts: 0, campaigns: 0, snapshots: 0 };
  }

  const platform = PLATFORM[connector];
  const products = await db.product.findMany({
    where: { organizationId },
    select: { id: true, code: true, name: true },
  });

  // Se cachean cuentas y campañas para no repetir la misma escritura por cada
  // fila: una campaña con 7 días trae 7 filas y es la misma campaña.
  const accountIds = new Map<string, string>();
  const campaignIds = new Map<string, string>();
  let snapshots = 0;

  for (const row of rows) {
    let accountId = accountIds.get(row.account_id);
    if (!accountId) {
      const account = await db.adAccount.upsert({
        where: {
          organizationId_platform_externalId: {
            organizationId,
            platform,
            externalId: row.account_id,
          },
        },
        create: {
          organizationId,
          platform,
          externalId: row.account_id,
          name: row.account_name,
          // No hay token propio: la credencial vive en Windsor. connectedAt se
          // marca igual para que la cuenta figure como conectada en el panel.
          connectedAt: new Date(),
        },
        update: { name: row.account_name, connectedAt: new Date() },
        select: { id: true },
      });
      accountId = account.id;
      accountIds.set(row.account_id, accountId);
    }

    let campaignId = campaignIds.get(row.campaign_id);
    if (!campaignId) {
      const campaign = await db.campaign.upsert({
        where: { adAccountId_externalId: { adAccountId: accountId, externalId: row.campaign_id } },
        create: {
          adAccountId: accountId,
          externalId: row.campaign_id,
          name: row.campaign,
          status: "ACTIVE",
          productId: matchProduct(row.campaign, products),
        },
        update: {
          name: row.campaign,
          productId: matchProduct(row.campaign, products),
        },
        select: { id: true },
      });
      campaignId = campaign.id;
      campaignIds.set(row.campaign_id, campaignId);
    }

    // La fecha se guarda a medianoche UTC y es parte de la clave: volver a
    // sincronizar el mismo día pisa la fila en vez de duplicarla. Importa
    // porque Meta ajusta las compras con días de retraso.
    const capturedAt = new Date(`${row.date}T00:00:00.000Z`);
    await db.metricSnapshot.upsert({
      where: { campaignId_capturedAt: { campaignId, capturedAt } },
      create: {
        campaignId,
        capturedAt,
        spend: row.spend,
        impressions: Math.round(row.impressions),
        clicks: Math.round(row.clicks),
        purchases: Math.round(row.actions_purchase),
        revenue: row.action_values_purchase,
      },
      update: {
        spend: row.spend,
        impressions: Math.round(row.impressions),
        clicks: Math.round(row.clicks),
        purchases: Math.round(row.actions_purchase),
        revenue: row.action_values_purchase,
      },
    });
    snapshots += 1;
  }

  return {
    accounts: accountIds.size,
    campaigns: campaignIds.size,
    snapshots,
  };
}

/** Vuelve a cruzar campañas con productos — se llama al crear un producto. */
export async function relinkCampaignsToProducts(organizationId: string) {
  const [products, campaigns] = await Promise.all([
    db.product.findMany({
      where: { organizationId },
      select: { id: true, code: true, name: true },
    }),
    db.campaign.findMany({
      where: { adAccount: { organizationId } },
      select: { id: true, name: true, productId: true },
    }),
  ]);

  let linked = 0;
  for (const campaign of campaigns) {
    const productId = matchProduct(campaign.name, products);
    if (productId && productId !== campaign.productId) {
      await db.campaign.update({ where: { id: campaign.id }, data: { productId } });
      linked += 1;
    }
  }
  return { linked };
}

export type WindsorRowForTest = WindsorRow;
