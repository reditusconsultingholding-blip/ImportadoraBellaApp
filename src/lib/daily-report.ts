import PDFDocument from "pdfkit";
import { db } from "@/lib/db";
import { getOverview } from "@/lib/metrics";
import { getSalesOverview } from "@/lib/sales";

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

// Arma el PDF del reporte diario para una organización. Se corre a
// medianoche (ver /api/cron/daily-report) y también se puede disparar a
// mano desde /dashboard/reportes ("Generar el de hoy").
export async function buildDailyReportPdf(organizationId: string, date: Date): Promise<Buffer> {
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  const [sales, metaOverview, tiktokOverview] = await Promise.all([
    getSalesOverview(organizationId),
    getOverview(organizationId, "META"),
    getOverview(organizationId, "TIKTOK"),
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
    if (overview.urgentProducts.length > 0) {
      doc.fillColor("#b03a2e").text(`Necesitan revisión (CPA por encima del objetivo): ${overview.urgentProducts.map((p) => p.name).join(", ")}`);
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

  return report;
}
