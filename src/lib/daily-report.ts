import PDFDocument from "pdfkit";
import { dailyReportHtml, emailConfigured, reportRecipients, sendEmail } from "@/lib/email";
import { db } from "@/lib/db";
import { getOverview } from "@/lib/metrics";
import { resolveRange } from "@/lib/date-range";
import { getSalesOverview } from "@/lib/sales";
import { getRentabilidad } from "@/lib/rentabilidad";
import { getPulses } from "@/lib/pulse";
import { calcularAlertasDiarias } from "@/lib/alertas-diarias";
import {
  barras,
  encabezado,
  moneda,
  moneda2,
  pie,
  recuadro,
  seccion,
  semaforo,
  tarjetas,
  torta,
} from "@/lib/pdf-dibujo";

// Arma el PDF del reporte diario para una organización. Se corre a
// medianoche (ver /api/cron/daily-report) y también se puede disparar a
// mano desde /dashboard/reportes ("Generar el de hoy").
export async function buildDailyReportPdf(organizationId: string, date: Date): Promise<Buffer> {
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  // El reporte del día cubre exactamente ese día, no los últimos treinta.
  const day = date.toISOString().slice(0, 10);
  const reportRange = resolveRange("personalizado", day, day);
  const [sales, metaOverview, tiktokOverview] = await Promise.all([
    getSalesOverview(organizationId, reportRange),
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

  // Se piden tambien rentabilidad, pulso y alertas: un reporte que solo dice
  // cuanto se vendio obliga a abrir la app para saber que hacer con eso.
  const [rentabilidad, pulsos, alertas] = await Promise.all([
    getRentabilidad(organizationId, reportRange),
    getPulses(organizationId, reportRange),
    calcularAlertasDiarias(organizationId),
  ]);

  // bufferPages permite volver atras al final y numerar el pie en todas.
  const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const dateLabel = dayStart.toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  encabezado(doc, org?.name ?? "Importadora Bella", `Reporte del ${dateLabel}`);

  // --- Los cuatro numeros que definen el dia.
  const gastoPauta = metaOverview.totalSpend + tiktokOverview.totalSpend;
  const pesoPauta = sales.totalSales > 0 ? gastoPauta / sales.totalSales : null;

  tarjetas(doc, [
    {
      label: "Facturado",
      valor: moneda(sales.totalSales),
      nota: `${sales.ordenes} ordenes`,
    },
    {
      label: "Ticket promedio",
      valor: moneda2(sales.aov),
      nota: `${sales.totalSalesChangePct >= 0 ? "+" : ""}${sales.totalSalesChangePct}% vs. ayer`,
    },
    {
      label: "Gasto en pauta",
      valor: moneda(gastoPauta),
      nota: pesoPauta == null ? undefined : `${Math.round(pesoPauta * 100)}% de lo facturado`,
      tono: pesoPauta != null && pesoPauta > 0.35 ? "mal" : "neutro",
    },
    {
      label: "Utilidad estimada",
      valor: moneda(rentabilidad.totales.utilidad),
      nota: "tras mercaderia y flete",
      tono: rentabilidad.totales.utilidad >= 0 ? "bien" : "mal",
    },
  ]);

  // --- Que hacer hoy. Va ARRIBA de los graficos a proposito: es lo unico que
  // cambia lo que alguien hace despues de leer el reporte.
  const paraApagar = alertas.filter((a) => a.tipo === "apagar");
  const paraEscalar = alertas.filter((a) => a.tipo === "escalar");

  if (paraApagar.length > 0) {
    seccion(doc, "Apagar o corregir hoy");
    recuadro(
      doc,
      `${paraApagar.length} ${paraApagar.length === 1 ? "producto esta" : "productos estan"} por encima de su punto de equilibrio`,
      paraApagar.slice(0, 5).map((a) => `${a.name}: ${a.mensaje}`),
      "mal"
    );
  }

  if (paraEscalar.length > 0) {
    seccion(doc, "Escalar hoy");
    recuadro(
      doc,
      `${paraEscalar.length} ${paraEscalar.length === 1 ? "producto aguanta" : "productos aguantan"} mas presupuesto`,
      paraEscalar.slice(0, 5).map((a) => `${a.name}: ${a.mensaje}`),
      "bien"
    );
  }

  // --- De donde vino la plata.
  if (sales.channels.length > 0) {
    seccion(doc, "Ventas por canal");
    torta(
      doc,
      sales.channels.map((c) => ({ label: c.label, valor: c.value }))
    );
  }

  if (sales.topProducts.length > 0) {
    seccion(doc, "Productos que mas vendieron");
    barras(
      doc,
      sales.topProducts.slice(0, 8).map((p) => ({ label: p.name, valor: p.value }))
    );
  }

  // --- La lectura en palabras de esos numeros.
  if (sales.lecturas.length > 0) {
    seccion(doc, "Que dicen estas ventas");
    semaforo(doc, sales.lecturas.map((l) => ({ texto: l, tono: "neutro" as const })));
  }

  // --- La pauta, plataforma por plataforma.
  seccion(doc, "Pauta");
  tarjetas(doc, [
    {
      label: "Meta · gasto",
      valor: moneda(metaOverview.totalSpend),
      nota: `${metaOverview.totalPurchases} compras · CTR ${metaOverview.ctr.toFixed(2)}%`,
    },
    {
      label: "TikTok · gasto",
      valor: moneda(tiktokOverview.totalSpend),
      nota: `${tiktokOverview.totalPurchases} compras · CTR ${tiktokOverview.ctr.toFixed(2)}%`,
    },
    {
      label: "Compras atribuidas",
      valor: String(metaOverview.totalPurchases + tiktokOverview.totalPurchases),
      nota: `contra ${sales.ordenes} ordenes reales`,
    },
  ]);

  // --- Salud de cada producto.
  const conPauta = pulsos.filter((p) => p.state !== "SIN_DATOS");
  if (conPauta.length > 0) {
    seccion(doc, "Salud de los productos");
    semaforo(
      doc,
      conPauta.slice(0, 12).map((p) => ({
        texto: `${p.name} — ${moneda(p.spend)}${p.cpa == null ? ", sin compras" : `, CPA ${moneda2(p.cpa)}`}`,
        detalle: p.motivos[0],
        tono:
          p.state === "SANO" ? ("bien" as const) : p.state === "RIESGO" ? ("mal" as const) : ("ojo" as const),
      }))
    );
  }

  // --- Rentabilidad: lo que gana y lo que pierde, con las barras en el mismo
  // eje para que la comparacion sea visual y no aritmetica.
  const conUtilidad = rentabilidad.filas.filter((f) => f.utilidad != null);
  if (conUtilidad.length > 0) {
    seccion(doc, "Utilidad por producto");
    barras(
      doc,
      conUtilidad
        .slice()
        .sort((a, b) => (b.utilidad ?? 0) - (a.utilidad ?? 0))
        .slice(0, 10)
        .map((f) => ({ label: f.name, valor: f.utilidad ?? 0 }))
    );
  }

  // --- Lo que aviso el sistema durante el dia.
  if (alerts.length > 0) {
    seccion(doc, "Avisos del dia");
    semaforo(
      doc,
      alerts.slice(0, 10).map((a) => ({ texto: a.message, tono: "neutro" as const }))
    );
  }

  pie(
    doc,
    `${org?.name ?? "Importadora Bella"} · generado el ${new Date().toLocaleString("es-EC", { timeZone: "America/Guayaquil" })} · hora de Ecuador`
  );
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

  // Las ordenes guardan el instante real de la compra, asi que su dia se corta
  // a la medianoche de Ecuador (05:00 UTC) y no a la medianoche UTC. Los
  // snapshots de pauta no: ahi la fecha es una marca de dia, y se compara tal
  // cual. Mezclarlos hacia que el reporte de la noche se comiera cinco horas
  // del dia siguiente.
  const ventasDesde = new Date(dayStart.getTime() + 5 * 3600_000);
  const ventasHasta = new Date(dayEnd.getTime() + 5 * 3600_000);

  const [orders, metrics] = await Promise.all([
    db.shopifyOrder.aggregate({
      where: {
        store: { organizationId },
        occurredAt: { gte: ventasDesde, lt: ventasHasta },
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
