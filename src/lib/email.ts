import { db } from "@/lib/db";

// Envío de correo por Resend. Se usa para el reporte diario y para las alertas
// críticas — lo que tiene que llegarle a Fabrizio y al equipo aunque no tengan
// la app abierta.
//
// Mientras el dominio no esté verificado en Resend, solo se puede enviar desde
// `onboarding@resend.dev` y únicamente a la casilla dueña de la cuenta. Por eso
// el remitente se elige solo: si hay dominio propio configurado se usa ese, y
// si no, el de prueba. Así esto funciona hoy y mejora solo cuando el DNS esté.

const RESEND_URL = "https://api.resend.com/emails";
const FALLBACK_FROM = "Jarvis <onboarding@resend.dev>";

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function sender() {
  const domain = process.env.EMAIL_FROM_DOMAIN?.trim();
  return domain ? `Jarvis · Importadora Bella <jarvis@${domain}>` : FALLBACK_FROM;
}

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function sendEmail({
  to,
  subject,
  html,
  attachment,
}: {
  to: string[];
  subject: string;
  html: string;
  attachment?: { filename: string; content: Buffer };
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "Falta RESEND_API_KEY." };
  if (to.length === 0) return { ok: false, error: "No hay destinatarios." };

  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: sender(),
      to,
      subject,
      html,
      ...(attachment
        ? {
            attachments: [
              { filename: attachment.filename, content: attachment.content.toString("base64") },
            ],
          }
        : {}),
    }),
  });

  const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !json.id) {
    return { ok: false, error: json.message ?? `Resend respondió ${res.status}` };
  }
  return { ok: true, id: json.id };
}

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/**
 * El correo del reporte diario. Va con el PDF adjunto y un resumen en el
 * cuerpo, para que se entienda desde el teléfono sin abrir el archivo.
 */
export function dailyReportHtml({
  date,
  orders,
  revenue,
  spend,
  purchases,
  appUrl,
}: {
  date: Date;
  orders: number;
  revenue: number;
  spend: number;
  purchases: number;
  appUrl: string;
}) {
  const day = date.toLocaleDateString("es-EC", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Guayaquil",
  });

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e1e3e5;color:#616161;font-size:14px;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e1e3e5;text-align:right;font-size:15px;font-weight:600;color:#1a1a1a;">${value}</td>
    </tr>`;

  // Todo el estilo va en línea: los clientes de correo descartan las hojas de
  // estilo, así que una clase CSS aquí no pinta nada.
  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f1f2f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e1e3e5;border-radius:10px;border-collapse:separate;">
    <tr><td style="padding:24px 24px 8px;">
      <p style="margin:0;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#616161;">Importadora Bella</p>
      <h1 style="margin:4px 0 0;font-size:20px;color:#1a1a1a;">Reporte del día</h1>
      <p style="margin:4px 0 0;font-size:14px;color:#616161;text-transform:capitalize;">${day}</p>
    </td></tr>
    <tr><td style="padding:8px 24px 0;">
      <table role="presentation" style="width:100%;border-collapse:collapse;">
        ${row("Ventas del día", money(revenue))}
        ${row("Órdenes", String(orders))}
        ${row("Inversión en pauta", money(spend))}
        ${row("Compras atribuidas", String(purchases))}
      </table>
    </td></tr>
    <tr><td style="padding:20px 24px 24px;">
      <a href="${appUrl}/dashboard/reportes" style="display:inline-block;background:#008060;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:14px;font-weight:600;">Ver el reporte completo</a>
      <p style="margin:14px 0 0;font-size:12px;color:#616161;">El PDF va adjunto a este correo.</p>
    </td></tr>
  </table>
</body></html>`;
}

/** A quién le llega el reporte: los administradores de la organización. */
export async function reportRecipients(organizationId: string) {
  const owners = await db.user.findMany({
    where: { organizationId, role: "OWNER" },
    select: { email: true },
  });
  return owners.map((o) => o.email);
}
