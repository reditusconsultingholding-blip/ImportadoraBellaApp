import { db } from "@/lib/db";
import { fetchWindsorRows, type WindsorConnector, type WindsorRow } from "./windsor";
import type { Platform } from "@/generated/prisma/client";
import { normalizar, parseCampaignRef } from "@/lib/product-code";

// Vuelca lo que trae Windsor en el modelo de la app: una AdAccount por cuenta
// publicitaria, una Campaign por campaña y un MetricSnapshot por campaña y día.

// Cuántos días se escriben por vuelta.
const LOTE = 500;

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
export function matchProduct(
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
  datePreset = "last_7dT"
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
  const porGuardar: {
    campaignId: string;
    capturedAt: Date;
    spend: number;
    impressions: number;
    clicks: number;
    purchases: number;
    revenue: number;
  }[] = [];

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
      const ref = parseCampaignRef(row.campaign);
      const productIdAuto = matchProduct(row.campaign, products);

      // Si alguien ya asignó el producto a mano desde Gestión de campañas, la
      // sincronización NO lo pisa — si no, la siguiente vuelta de 5 minutos
      // deshace la corrección.
      const existing = await db.campaign.findUnique({
        where: { adAccountId_externalId: { adAccountId: accountId, externalId: row.campaign_id } },
        select: { id: true, productManual: true, productId: true },
      });
      const productIdFinal = existing?.productManual ? existing.productId : productIdAuto;

      // A qué lote pertenece, si el nombre trae la nomenclatura {código}-{n}.
      // Es lo que permite saber después quién hizo esta campaña.
      let rondaId: string | null = null;
      if (ref?.lote != null && productIdFinal) {
        const ronda = await db.ronda.findFirst({
          where: { organizationId, productId: productIdFinal, numero: ref.lote },
          select: { id: true },
        });
        rondaId = ronda?.id ?? null;
      }

      const campaign = await db.campaign.upsert({
        where: { adAccountId_externalId: { adAccountId: accountId, externalId: row.campaign_id } },
        create: {
          adAccountId: accountId,
          externalId: row.campaign_id,
          name: row.campaign,
          status: "ACTIVE",
          productId: productIdAuto,
          rondaId,
          tipoCampana: ref?.tipo ?? null,
        },
        update: {
          name: row.campaign,
          ...(existing?.productManual ? {} : { productId: productIdAuto }),
          ...(rondaId ? { rondaId } : {}),
          ...(ref?.tipo ? { tipoCampana: ref.tipo } : {}),
        },
        select: { id: true },
      });
      campaignId = campaign.id;
      campaignIds.set(row.campaign_id, campaignId);

      // La campaña recién apareció: si había una fila manual de "gestión de
      // campañas" (importada de Notion) esperándola por nombre, ya no hace
      // falta — se borra para no duplicarla en la lista. Se compara por
      // nombre normalizado porque mayúsculas y espacios casi nunca coinciden
      // letra por letra entre lo que escribió el equipo en Notion y el
      // nombre real de la campaña.
      if (!existing) {
        const candidatas = await db.campanaManual.findMany({
          where: { organizationId },
          select: { id: true, nombre: true },
        });
        const objetivo = normalizar(row.campaign);
        const aBorrar = candidatas.filter((c) => normalizar(c.nombre) === objetivo).map((c) => c.id);
        if (aBorrar.length > 0) {
          await db.campanaManual.deleteMany({ where: { id: { in: aBorrar } } });
        }
      }
    }

    // La fecha se guarda a medianoche UTC y es parte de la clave: volver a
    // sincronizar el mismo día pisa la fila en vez de duplicarla. Importa
    // porque Meta ajusta las compras con días de retraso.
    porGuardar.push({
      campaignId,
      capturedAt: new Date(`${row.date}T00:00:00.000Z`),
      spend: row.spend,
      impressions: Math.round(row.impressions),
      clicks: Math.round(row.clicks),
      purchases: Math.round(row.actions_purchase),
      revenue: row.action_values_purchase,
    });
  }

  // Los días se escriben por lotes y no de a uno.
  //
  // De a uno eran ~4.300 viajes al pooler para TikTok (615 campañas por 7
  // días) y la corrida no llegaba a terminar: cada despliegue la cortaba a
  // mitad de camino y el conector nunca registraba una sincronización buena.
  //
  // Se borra y se vuelve a insertar en vez de actualizar fila por fila: lo
  // que dice Windsor reemplaza por completo lo que había para esos días, así
  // que no hay nada que conservar.
  for (let i = 0; i < porGuardar.length; i += LOTE) {
    const lote = porGuardar.slice(i, i + LOTE);
    await db.metricSnapshot.deleteMany({
      where: {
        OR: lote.map((s) => ({ campaignId: s.campaignId, capturedAt: s.capturedAt })),
      },
    });
    await db.metricSnapshot.createMany({ data: lote });
    snapshots += lote.length;
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
      select: { id: true, name: true, productId: true, productManual: true },
    }),
  ]);

  let linked = 0;
  for (const campaign of campaigns) {
    // Asignada a mano: se respeta, el auto-match no la toca.
    if (campaign.productManual) continue;
    const productId = matchProduct(campaign.name, products);
    if (productId && productId !== campaign.productId) {
      await db.campaign.update({ where: { id: campaign.id }, data: { productId } });
      linked += 1;
    }
  }
  return { linked };
}

export type WindsorRowForTest = WindsorRow;
