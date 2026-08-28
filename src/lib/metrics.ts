import { db } from "@/lib/db";
import type { Platform } from "@/generated/prisma/client";
import type { Range } from "@/lib/date-range";

export type RowMetric = {
  key: string;
  name: string;
  // El código del producto cuando la campaña está asociada a uno; null cuando
  // la fila es una campaña suelta.
  code: string | null;
  spend: number;
  purchases: number;
  revenue: number;
  clicks: number;
  impressions: number;
  cpa: number | null;
  cpaTarget: number | null;
  /**
   * El mismo semáforo que usa el Pulso, con el mismo corte. Antes esta tabla
   * decía "Bien" y "Urgente" mientras el Pulso decía "Sano", "Vigilar" y
   * "En riesgo" para lo mismo: dos vocabularios para la misma idea, y nadie
   * sabía si eran dos cosas distintas.
   */
  status: "sano" | "vigilar" | "riesgo" | "sin-objetivo";
};

export type Overview = {
  totalSpend: number;
  totalPurchases: number;
  totalRevenue: number;
  ctr: number;
  roas: number | null;
  rows: RowMetric[];
  topRow: RowMetric | null;
  urgentRows: RowMetric[];
  campaignsWithoutProduct: number;
};

/**
 * Resumen de pauta para un rango de fechas.
 *
 * Antes esto tomaba solo el snapshot MÁS RECIENTE de cada campaña y descartaba
 * toda campaña sin producto asociado (`if (!snapshot || !campaign.product)`).
 * Con 722 campañas reales y ningún producto cargado, eso hacía que el panel
 * mostrara cero habiendo decenas de miles de dólares de gasto en la base.
 * Ahora:
 *
 *  - suma TODOS los días del rango, no un único snapshot;
 *  - una campaña sin producto se muestra igual, como fila propia, en vez de
 *    desaparecer. Un número que falta se nota; uno que se esconde, no.
 */
export async function getOverview(
  organizationId: string,
  platform: Platform,
  range: Range
): Promise<Overview> {
  const campaigns = await db.campaign.findMany({
    where: { adAccount: { organizationId, platform } },
    include: {
      product: { select: { code: true, name: true, cpaTarget: true } },
      metrics: {
        where: { capturedAt: { gte: range.from, lte: range.to } },
        select: { spend: true, purchases: true, revenue: true, clicks: true, impressions: true },
      },
    },
  });

  const rows = new Map<string, RowMetric>();
  let campaignsWithoutProduct = 0;

  for (const campaign of campaigns) {
    if (campaign.metrics.length === 0) continue;
    if (!campaign.product) campaignsWithoutProduct += 1;

    // Las campañas con producto se agrupan bajo el producto; las sueltas
    // quedan una fila por campaña.
    const key = campaign.product ? `p:${campaign.product.code}` : `c:${campaign.id}`;
    const row: RowMetric = rows.get(key) ?? {
      key,
      name: campaign.product?.name ?? campaign.name,
      code: campaign.product?.code ?? null,
      spend: 0,
      purchases: 0,
      revenue: 0,
      clicks: 0,
      impressions: 0,
      cpa: null,
      cpaTarget: campaign.product?.cpaTarget ?? null,
      // Se recalcula más abajo con el CPA real; aquí solo hace falta un valor.
      status: "sin-objetivo" as const,
    };

    for (const m of campaign.metrics) {
      row.spend += m.spend;
      row.purchases += m.purchases;
      row.revenue += m.revenue;
      row.clicks += m.clicks;
      row.impressions += m.impressions;
    }

    rows.set(key, row);
  }

  const list = Array.from(rows.values()).map((r) => {
    const cpa = r.purchases > 0 ? r.spend / r.purchases : null;
    // Hasta un 15% por encima del objetivo se considera que hay margen para
    // corregirlo con creativos; más que eso ya es plata que se pierde.
    const status: RowMetric["status"] =
      r.cpaTarget === null || r.cpaTarget <= 0
        ? "sin-objetivo"
        : cpa === null
          ? "riesgo"
          : cpa <= r.cpaTarget
            ? "sano"
            : cpa <= r.cpaTarget * 1.15
              ? "vigilar"
              : "riesgo";
    return { ...r, cpa, status };
  });

  // Ordenado por gasto: lo que más plata consume es lo primero que hay que
  // mirar, tenga o no producto asociado.
  list.sort((a, b) => b.spend - a.spend);

  const totalSpend = list.reduce((s, r) => s + r.spend, 0);
  const totalPurchases = list.reduce((s, r) => s + r.purchases, 0);
  const totalRevenue = list.reduce((s, r) => s + r.revenue, 0);
  const totalClicks = list.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = list.reduce((s, r) => s + r.impressions, 0);

  return {
    totalSpend,
    totalPurchases,
    totalRevenue,
    ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    roas: totalSpend > 0 ? totalRevenue / totalSpend : null,
    rows: list,
    topRow: list[0] ?? null,
    urgentRows: list.filter((r) => r.status === "riesgo"),
    campaignsWithoutProduct,
  };
}
