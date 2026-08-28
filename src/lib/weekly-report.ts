import { db } from "@/lib/db";
import { getPulses } from "@/lib/pulse";
import { resolveRange } from "@/lib/date-range";
import { emailConfigured, reportRecipients, sendEmail } from "@/lib/email";

// El reporte semanal de salud de productos, para el CEO.
//
// El reporte diario cuenta cómo fue el día; este cuenta cómo viene cada
// producto. Es la diferencia entre mirar el termómetro y mirar la curva: un
// producto puede tener un buen martes y estar perdiendo terreno hace tres
// semanas, y eso solo se ve poniendo los días uno al lado del otro.

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** El lunes de la semana a la que pertenece una fecha, en hora de Ecuador. */
export function lunesDeLaSemana(referencia: Date) {
  const enEcuador = new Date(referencia.getTime() - 5 * 3600_000);
  const dia = enEcuador.getUTCDay(); // 0 domingo … 6 sábado
  const alLunes = dia === 0 ? 6 : dia - 1;
  return new Date(
    Date.UTC(
      enEcuador.getUTCFullYear(),
      enEcuador.getUTCMonth(),
      enEcuador.getUTCDate() - alLunes
    )
  );
}

function cuerpoHtml(o: {
  orgName: string;
  desde: string;
  hasta: string;
  appUrl: string;
  filas: {
    name: string;
    code: string | null;
    estado: string;
    score: number;
    spend: number;
    purchases: number;
    cpa: number | null;
    cpaTarget: number | null;
    motivos: string[];
  }[];
  gasto: number;
  facturado: number;
}) {
  const color: Record<string, string> = {
    RIESGO: "#b42318",
    VIGILAR: "#b26e00",
    SANO: "#0f7a4f",
    SIN_DATOS: "#616161",
  };
  const nombre: Record<string, string> = {
    RIESGO: "En riesgo",
    VIGILAR: "Vigilar",
    SANO: "Sano",
    SIN_DATOS: "Sin pauta",
  };

  const fila = (f: (typeof o.filas)[number]) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e1e3e5">
        <div style="font-weight:600">${f.name}</div>
        <div style="font-size:12px;color:#616161">${f.motivos[0] ?? ""}</div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e1e3e5;white-space:nowrap">
        <span style="color:${color[f.estado]};font-weight:600">${nombre[f.estado]}</span>
        <span style="color:#616161"> · ${f.score}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e1e3e5;text-align:right;white-space:nowrap">
        ${money(f.spend)}<br>
        <span style="font-size:12px;color:#616161">${f.purchases} compras</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e1e3e5;text-align:right;white-space:nowrap">
        ${f.cpa == null ? "—" : money(f.cpa)}<br>
        <span style="font-size:12px;color:#616161">obj ${f.cpaTarget == null ? "—" : money(f.cpaTarget)}</span>
      </td>
    </tr>`;

  const enRiesgo = o.filas.filter((f) => f.estado === "RIESGO");

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;max-width:640px">
    <h1 style="font-size:20px;margin:0 0 4px">Salud de los productos</h1>
    <p style="margin:0 0 20px;color:#616161;font-size:14px">
      ${o.orgName} · semana del ${o.desde} al ${o.hasta}
    </p>

    <div style="display:flex;gap:24px;margin-bottom:20px">
      <div>
        <div style="font-size:11px;text-transform:uppercase;color:#616161">Facturado</div>
        <div style="font-size:20px;font-weight:600">${money(o.facturado)}</div>
      </div>
      <div>
        <div style="font-size:11px;text-transform:uppercase;color:#616161">Gasto en pauta</div>
        <div style="font-size:20px;font-weight:600">${money(o.gasto)}</div>
      </div>
    </div>

    ${
      enRiesgo.length > 0
        ? `<p style="background:#fdecea;border:1px solid #b4231833;border-radius:6px;padding:10px 12px;font-size:14px;margin:0 0 20px">
             <strong>${enRiesgo.length} ${enRiesgo.length === 1 ? "producto está" : "productos están"} en riesgo</strong>
             y se ${enRiesgo.length === 1 ? "llevó" : "llevaron"} ${money(enRiesgo.reduce((s, f) => s + f.spend, 0))} esta semana.
           </p>`
        : `<p style="background:#e3f5eb;border:1px solid #0f7a4f33;border-radius:6px;padding:10px 12px;font-size:14px;margin:0 0 20px">
             Ningún producto quedó en riesgo esta semana.
           </p>`
    }

    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead>
        <tr style="text-align:left;font-size:11px;text-transform:uppercase;color:#616161">
          <th style="padding:6px 12px">Producto</th>
          <th style="padding:6px 12px">Pulso</th>
          <th style="padding:6px 12px;text-align:right">Gasto</th>
          <th style="padding:6px 12px;text-align:right">CPA</th>
        </tr>
      </thead>
      <tbody>${o.filas.map(fila).join("")}</tbody>
    </table>

    <p style="margin-top:24px">
      <a href="${o.appUrl}/dashboard" style="background:#008060;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500">
        Abrir el panel
      </a>
    </p>
  </div>`;
}

/**
 * Arma y manda el reporte de la semana que cerró, si todavía no se mandó.
 *
 * Devuelve null cuando no había nada que hacer — o porque ya se envió, o
 * porque no hubo pauta en la semana. Un correo diciendo "no pasó nada" cada
 * lunes es la forma más rápida de que dejen de abrirlo.
 */
export async function enviarReporteSemanal(organizationId: string, referencia = new Date()) {
  // La semana que se resume es la ANTERIOR a la que corre: el lunes se manda
  // el cierre de la semana pasada, no un resumen a medio hacer de la actual.
  const lunesActual = lunesDeLaSemana(referencia);
  const lunesPasado = new Date(lunesActual);
  lunesPasado.setUTCDate(lunesPasado.getUTCDate() - 7);
  const domingoPasado = new Date(lunesActual);
  domingoPasado.setUTCDate(domingoPasado.getUTCDate() - 1);

  const yaFue = await db.weeklyReport.findUnique({
    where: { organizationId_weekStart: { organizationId, weekStart: lunesPasado } },
    select: { id: true },
  });
  if (yaFue) return null;

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const range = resolveRange("personalizado", iso(lunesPasado), iso(domingoPasado));

  const [pulsos, ventas, org] = await Promise.all([
    getPulses(organizationId, range),
    db.shopifyOrder.aggregate({
      where: {
        store: { organizationId },
        occurredAt: { gte: range.fromInstant, lte: range.toInstant },
      },
      _sum: { netSales: true },
    }),
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
  ]);

  const conPauta = pulsos.filter((p) => p.state !== "SIN_DATOS");
  if (conPauta.length === 0) return null;

  const gasto = conPauta.reduce((s, p) => s + p.spend, 0);
  const facturado = ventas._sum.netSales ?? 0;

  const bonito = (d: Date) =>
    d.toLocaleDateString("es-EC", { day: "numeric", month: "long", timeZone: "UTC" });

  const html = cuerpoHtml({
    orgName: org?.name ?? "Importadora Bella",
    desde: bonito(lunesPasado),
    hasta: bonito(domingoPasado),
    appUrl: process.env.APP_URL?.trim() || "https://www.jarvisecom.world",
    filas: conPauta.map((p) => ({
      name: p.name,
      code: p.code,
      estado: p.state,
      score: p.score,
      spend: p.spend,
      purchases: p.purchases,
      cpa: p.cpa,
      cpaTarget: p.cpaTarget,
      motivos: p.motivos,
    })),
    gasto,
    facturado,
  });

  const enRiesgo = conPauta.filter((p) => p.state === "RIESGO").length;
  const resumen =
    enRiesgo > 0
      ? `${enRiesgo} de ${conPauta.length} productos en riesgo · ${money(gasto)} de pauta · ${money(facturado)} facturado`
      : `Los ${conPauta.length} productos con pauta dentro de su objetivo · ${money(gasto)} de pauta · ${money(facturado)} facturado`;

  let destinatarios: string[] = [];
  let errorCorreo: string | null = null;
  if (emailConfigured()) {
    destinatarios = await reportRecipients(organizationId);
    if (destinatarios.length > 0) {
      const r = await sendEmail({
        to: destinatarios,
        subject: `Salud de productos · semana del ${bonito(lunesPasado)}`,
        html,
      });
      // Si el correo no sale se anota y se sigue.
      //
      // Antes esto lanzaba, para que el reloj reintentara. Pero el motivo real
      // de que falle es de configuración —el dominio de Resend sin verificar—,
      // y eso no se arregla solo: reintentar cada cinco minutos para siempre
      // castiga a Resend y nunca deja constancia de la semana. El aviso dentro
      // de la app sale igual, que es lo que garantiza que alguien se entere.
      if (!r.ok) errorCorreo = r.error ?? "error desconocido";
    }
  }

  // Se deja constancia también dentro de la app, para quien no mire el correo.
  const duenos = await db.user.findMany({
    where: { organizationId, role: "OWNER" },
    select: { id: true },
  });
  for (const d of duenos) {
    await db.notification.create({
      data: {
        userId: d.id,
        type: "daily_report",
        message: `Reporte semanal de productos: ${resumen}`,
        link: "/dashboard/productos",
      },
    });
  }

  await db.weeklyReport.create({
    data: {
      organizationId,
      weekStart: lunesPasado,
      enviadoA: errorCorreo
        ? `no salió por correo (${errorCorreo.slice(0, 200)}) — solo aviso interno`
        : destinatarios.join(", ") || "solo aviso interno",
      resumen,
    },
  });

  return resumen;
}
