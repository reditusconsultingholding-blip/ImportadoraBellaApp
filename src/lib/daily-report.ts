import PDFDocument from "pdfkit";
import { dailyReportHtml, emailConfigured, reportRecipients, sendEmail } from "@/lib/email";
import { db } from "@/lib/db";
import { getOverview } from "@/lib/metrics";
import { resolveRange } from "@/lib/date-range";
import { getSalesOverview } from "@/lib/sales";

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

// Arma el PDF del reporte diario para una organización. Se corre a
// medianoche (ver /api/cron/daily-report) y también se puede disparar a
// mano desde /dashboard/reportes ("Generar el de hoy").
export async function buildDailyReportPdf(organizationId: string, date: Date): Promise<Buffer> {
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  // El reporte del día cubre exactamente ese día, no los últimos treinta.
  const day = date.toISOString().slice(0, 10);
  const reportRange = resolveRange("personalizado", day, day);
  const [sales, metaOverview, tiktokOverview] = await Promise.all([
    getSalesOverview(organizationId),
    getOverview(organizationId, "META", reportRange),
    getOverview(organizationId, "TIKTOK", reportRange),
  ]);

  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const owners = await db.user.findMany({
    where: { organizationId, role: { in: ["OWNER", "DIRECTOR"] } },
    select: { id: true },
  });
  const alerts = await db.notification.findMany({
    where: {
      userId: { in: owners.map((o) => o.id) },
      type: { in: ["alert_escala", "alert_fatiga", "alert_discrepancia"] },
      createdAt: { gte: dayStart, lt: dayEnd },
    },
    orderBy: { createdAt: "desc" },
    distinct: ["message"],
  });

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const dateLabel = dayStart.toLocaleDateString("es-EC", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });

  doc.fontSize(20).text(org?.name ?? "Importadora Bella", { continued: false });
  doc.fontSize(11).fillColor("#666").text(`Reporte diario — ${dateLabel}`);
  doc.moveDown(1.5);

  doc.fillColor("#000").fontSize(14).text("Ventas (Shopify)");
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor("#333");
  doc.text(`Ventas totales: ${money(sales.totalSales)} (${sales.totalSalesChangePct >= 0 ? "+" : ""}${sales.totalSalesChangePct.toFixed(1)}% vs. ayer)`);
  doc.text(`Ticket promedio: ${money(sales.aov)}`);
  if (sales.topProducts.length > 0) {
    doc.moveDown(0.3);
    doc.text("Top productos:");
    for (const p of sales.topProducts.slice(0, 5)) {
      doc.text(`  • ${p.name} — ${money(p.value)}`);
    }
  }
  doc.moveDown(1);

  for (const [label, overview] of [
    ["Meta Ads", metaOverview],
    ["TikTok Ads", tiktokOverview],
  ] as const) {
    doc.fillColor("#000").fontSize(14).text(label);
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#333");
    doc.text(`Gasto: ${money(overview.totalSpend)} · Compras: ${overview.totalPurchases} · CTR: ${overview.ctr.toFixed(2)}%`);
    if (overview.urgentRows.length > 0) {
      doc.fillColor("#b03a2e").text(`Necesitan revisión (CPA por encima del objetivo): ${overview.urgentRows.map((p) => p.name).join(", ")}`);
      doc.fillColor("#333");
    }
    doc.moveDown(1);
  }

  doc.fillColor("#000").fontSize(14).text("Alertas de hoy");
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor("#333");
  if (alerts.length === 0) {
    doc.text("Sin alertas nuevas en las últimas 24 horas.");
  } else {
    for (const a of alerts.slice(0, 15)) {
      doc.text(`• ${a.message}`);
    }
  }

  doc.end();
  return done;
}

export async function generateAndStoreDailyReport(organizationId: string, date: Date) {
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const pdfBuffer = await buildDailyReportPdf(organizationId, date);
  const pdf = new Uint8Array(pdfBuffer);

  const report = await db.dailyReport.upsert({
    where: { organizationId_date: { organizationId, date: dayStart } },
    create: { organizationId, date: dayStart, pdf },
    update: { pdf },
  });

  const owners = await db.user.findMany({
    where: { organizationId, role: "OWNER" },
    select: { id: true },
  });
  const dateLabel = dayStart.toLocaleDateString("es-EC", { day: "2-digit", month: "long", timeZone: "UTC" });
  for (const owner of owners) {
    await db.notification.create({
      data: {
        userId: owner.id,
        type: "daily_report",
        message: `El reporte diario del ${dateLabel} ya está listo.`,
        link: `/api/reports/${report.id}/pdf`,
      },
    });
  }

  // Además del aviso dentro de la app, el reporte sale por correo — que es lo
  // que hace que llegue aunque nadie tenga el panel abierto. Si el envío falla
  // NO se corta la generación: el PDF ya quedó guardado y la notificación
  // interna también, así que perder el correo no debe perder el reporte.
  if (emailConfigured()) {
    try {
      const to = await reportRecipients(organizationId);
      const totals = await dayTotals(organizationId, dayStart);
      const result = await sendEmail({
        to,
        subject: `Reporte del ${dateLabel} · Importadora Bella`,
        html: dailyReportHtml({
          date: dayStart,
          appUrl: process.env.APP_URL?.trim() || "https://jarvis-production-0120.up.railway.app",
          ...totals,
        }),
        attachment: {
          filename: `reporte-${dayStart.toISOString().slice(0, 10)}.pdf`,
          content: pdfBuffer,
        },
      });
      if (!result.ok) console.error("[reporte diario] no se pudo enviar el correo:", result.error);
    } catch (err) {
      console.error("[reporte diario] error enviando el correo:", err);
    }
  }

  return report;
}

// Los cuatro números que van en el cuerpo del correo.
async function dayTotals(organizationId: string, dayStart: Date) {
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const [orders, metrics] = await Promise.all([
    db.shopifyOrder.aggregate({
      where: {
        store: { organizationId },
        occurredAt: { gte: dayStart, lt: dayEnd },
      },
      _count: { _all: true },
      _sum: { netSales: true },
    }),
    db.metricSnapshot.aggregate({
      where: {
        campaign: { adAccount: { organizationId } },
        capturedAt: { gte: dayStart, lt: dayEnd },
      },
      _sum: { spend: true, purchases: true },
    }),
  ]);

  return {
    orders: orders._count._all,
    revenue: orders._sum.netSales ?? 0,
    spend: metrics._sum.spend ?? 0,
    purchases: metrics._sum.purchases ?? 0,
  };
}
