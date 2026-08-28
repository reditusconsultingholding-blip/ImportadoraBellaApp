import { db } from "@/lib/db";

// Motor de alertas: revisa las métricas ya sincronizadas de Meta/TikTok (y
// las órdenes de Shopify) y genera Notification para OWNER/DIRECTOR cuando
// detecta algo que amerita mirar. No pausa ni cambia nada solo — igual que
// PendingAction, siempre es la persona la que decide qué hacer.
//
// Se corre automáticamente en cada sync (ver /api/cron/sync) y también se
// puede disparar a mano desde /api/alerts/check ("Revisar alertas ahora"
// en el Centro de notificaciones).
//
// Umbrales (ajustables aquí, no hay una fórmula "oficial" de Fabrizio todavía):
const SCALE_CPA_RATIO = 0.7; // CPA <= 70% del objetivo
const SCALE_MIN_PURCHASES = 5;
const FATIGUE_CTR_DROP = 0.4; // CTR cae 40%+ entre snapshots consecutivos
const FATIGUE_CPA_INCREASE = 1.4; // o CPA sube 40%+
const DISCREPANCY_MIN_DIFF_PCT = 0.3; // compras de pauta vs. órdenes Shopify difieren 30%+
const DISCREPANCY_MIN_VOLUME = 5;
const DEDUP_WINDOW_HOURS = 12;

// dedupLink identifica de forma estable la fuente de la alerta (campaña,
// producto, día) — se guarda como el "link" de la notificación, así sirve
// dos veces: para no repetir el mismo aviso dentro de la ventana de dedup,
// y como destino al hacer click.
async function notifyLeads(
  organizationId: string,
  type: "alert_escala" | "alert_fatiga" | "alert_discrepancia",
  message: string,
  dedupLink: string
) {
  const since = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000);
  const leads = await db.user.findMany({
    where: { organizationId, role: { in: ["OWNER", "DIRECTOR"] } },
    select: { id: true },
  });

  let created = 0;
  for (const lead of leads) {
    const recent = await db.notification.findFirst({
      where: { userId: lead.id, type, link: dedupLink, createdAt: { gte: since } },
    });
    if (recent) continue;
    await db.notification.create({ data: { userId: lead.id, type, message, link: dedupLink } });
    created++;
  }
  return created;
}

export async function runAlertChecks(organizationId: string) {
  const summary = { escala: 0, fatiga: 0, discrepancia: 0 };

  // --- Oportunidad de escalar: CPA muy por debajo del objetivo con volumen real.
  const campaigns = await db.campaign.findMany({
    where: { adAccount: { organizationId } },
    include: {
      product: true,
      adAccount: true,
      metrics: { orderBy: { capturedAt: "desc" }, take: 2 },
    },
  });

  for (const c of campaigns) {
    const latest = c.metrics[0];
    if (!latest || !c.product || latest.purchases < SCALE_MIN_PURCHASES) continue;
    const cpa = latest.purchases > 0 ? latest.spend / latest.purchases : null;
    if (cpa !== null && cpa <= c.product.cpaTarget * SCALE_CPA_RATIO) {
      const msg = `${c.product.name} (${c.adAccount.platform === "META" ? "Meta" : "TikTok"}) tiene CPA de $${cpa.toFixed(2)}, muy por debajo del objetivo ($${c.product.cpaTarget.toFixed(2)}) — oportunidad de escalar presupuesto en "${c.name}".`;
      const n = await notifyLeads(organizationId, "alert_escala", msg, `/dashboard?platform=${c.adAccount.platform}&campaign=${c.id}`);
      summary.escala += n;
    }

    // --- Fatiga: CTR cae fuerte o CPA sube fuerte entre los dos últimos snapshots.
    const prev = c.metrics[1];
    if (prev) {
      const ctrLatest = latest.impressions > 0 ? latest.clicks / latest.impressions : null;
      const ctrPrev = prev.impressions > 0 ? prev.clicks / prev.impressions : null;
      const cpaPrev = prev.purchases > 0 ? prev.spend / prev.purchases : null;

      const ctrDropped = ctrLatest !== null && ctrPrev !== null && ctrPrev > 0 && ctrLatest <= ctrPrev * (1 - FATIGUE_CTR_DROP);
      const cpaRose = cpa !== null && cpaPrev !== null && cpaPrev > 0 && cpa >= cpaPrev * FATIGUE_CPA_INCREASE;

      if (ctrDropped || cpaRose) {
        const detail = ctrDropped
          ? `el CTR cayó de ${((ctrPrev ?? 0) * 100).toFixed(2)}% a ${((ctrLatest ?? 0) * 100).toFixed(2)}%`
          : `el CPA subió de $${(cpaPrev ?? 0).toFixed(2)} a $${(cpa ?? 0).toFixed(2)}`;
        const msg = `Posible fatiga de anuncio en "${c.name}" (${c.product.name}) — ${detail}. Puede ser momento de refrescar el creativo.`;
        const n = await notifyLeads(organizationId, "alert_fatiga", msg, `/dashboard?platform=${c.adAccount.platform}&campaign=${c.id}`);
        summary.fatiga += n;
      }
    }
  }

  // --- Discrepancia: compras reportadas por Meta+TikTok vs. órdenes de Shopify
  // en la misma ventana reciente. No hay timestamp por snapshot histórico
  // confiable en todos los casos, así que esto compara totales recientes —
  // es una señal para revisar, no una conciliación contable exacta.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const adPurchases = campaigns.reduce((sum, c) => sum + (c.metrics[0]?.purchases ?? 0), 0);
  const shopifyOrders = await db.shopifyOrder.count({
    where: { store: { organizationId }, occurredAt: { gte: since } },
  });

  if (adPurchases >= DISCREPANCY_MIN_VOLUME || shopifyOrders >= DISCREPANCY_MIN_VOLUME) {
    const base = Math.max(adPurchases, shopifyOrders, 1);
    const diffPct = Math.abs(adPurchases - shopifyOrders) / base;
    if (diffPct >= DISCREPANCY_MIN_DIFF_PCT) {
      const msg = `Meta+TikTok reportan ${adPurchases} compras en las últimas 24h pero Shopify solo registra ${shopifyOrders} órdenes — vale la pena revisar el pixel/tracking antes de tomar decisiones de presupuesto con esos números.`;
      const n = await notifyLeads(organizationId, "alert_discrepancia", msg, `/dashboard?alert=discrepancia&d=${new Date().toDateString()}`);
      summary.discrepancia += n;
    }
  }

  return summary;
}
