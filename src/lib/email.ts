import { db } from "@/lib/db";

// Envío de correo por Resend.
//
// Esto existió antes y se quitó (commit c469ae3) porque el dominio nunca se
// verificó: el envío fallaba siempre y solo dejaba ruido en los registros.
// Vuelve porque ahora se van a usar tres caminos —reporte diario a los CEO,
// avisos a los editores y recuperación de contraseña— y conviene tener uno
// solo bien hecho en lugar de tres a medias.
//
// Regla de oro: **nada de esto puede tumbar el flujo que lo llamó.** Si el
// correo falla, la notificación dentro de la app ya se creó y el trabajo
// siguió. Por eso `sendEmail` devuelve un resultado y no lanza.
//
// Mientras el dominio no esté verificado en Resend solo se puede enviar desde
// `onboarding@resend.dev`, y únicamente a la casilla dueña de la cuenta. El
// remitente se elige solo: si hay dominio propio configurado usa ese, y si no
// el de prueba. Así funciona hoy y mejora solo cuando el DNS esté.

const RESEND_URL = "https://api.resend.com/emails";
const FALLBACK_FROM = "Jarvis <onboarding@resend.dev>";

/** Sin clave no hay envío, y quien llama decide si eso es un problema. */
export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function sender() {
  const domain = process.env.EMAIL_FROM_DOMAIN?.trim();
  return domain ? `Jarvis · Importadora Bella <jarvis@${domain}>` : FALLBACK_FROM;
}

/** La dirección pública de la app, para los enlaces de los correos. */
export function appUrl() {
  return (process.env.APP_URL?.trim() || "https://jarvisecom.world").replace(/\/$/, "");
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

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

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
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
  } catch (err) {
    // Red caída, DNS, timeout. No se propaga: el correo es un extra sobre la
    // notificación que ya quedó guardada.
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------
// Plantillas
//
// Todo el estilo va en línea: los clientes de correo descartan las hojas de
// estilo, así que una clase CSS acá no pinta nada. Y nada de imágenes remotas
// —Gmail las bloquea— así que la marca se hace con tipografía y color.
// ---------------------------------------------------------------------------

/** El marco compartido. Que los tres correos se lean como del mismo producto. */
function envoltorio({
  titulo,
  bajada,
  cuerpo,
  boton,
  pie,
}: {
  titulo: string;
  bajada?: string;
  cuerpo: string;
  boton?: { texto: string; href: string };
  pie?: string;
}) {
  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f1f2f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e1e3e5;border-radius:10px;border-collapse:separate;">
    <tr><td style="padding:22px 24px;background:#002e25;border-radius:10px 10px 0 0;">
      <p style="margin:0;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#00a47c;font-weight:700;">Importadora Bella</p>
      <h1 style="margin:6px 0 0;font-size:20px;line-height:1.25;color:#ffffff;font-weight:600;">${titulo}</h1>
      ${bajada ? `<p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.55);">${bajada}</p>` : ""}
    </td></tr>
    <tr><td style="padding:20px 24px 4px;">${cuerpo}</td></tr>
    ${
      boton
        ? `<tr><td style="padding:16px 24px 8px;">
            <a href="${boton.href}" style="display:inline-block;background:#008060;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:14px;font-weight:600;">${boton.texto}</a>
          </td></tr>`
        : ""
    }
    ${
      pie
        ? `<tr><td style="padding:6px 24px 22px;"><p style="margin:0;font-size:12px;line-height:1.5;color:#616161;">${pie}</p></td></tr>`
        : `<tr><td style="padding:0 24px 22px;"></td></tr>`
    }
  </table>
</body></html>`;
}

function fila(label: string, value: string) {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #e1e3e5;color:#616161;font-size:14px;">${label}</td>
    <td style="padding:10px 0;border-bottom:1px solid #e1e3e5;text-align:right;font-size:15px;font-weight:600;color:#1a1a1a;">${value}</td>
  </tr>`;
}

/**
 * Reporte diario para los CEO. Va con el PDF adjunto y un resumen en el
 * cuerpo, para que se entienda desde el teléfono sin abrir el archivo.
 */
export function dailyReportHtml({
  date,
  orders,
  revenue,
  spend,
  purchases,
}: {
  date: Date;
  orders: number;
  revenue: number;
  spend: number;
  purchases: number;
}) {
  const day = date.toLocaleDateString("es-EC", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return envoltorio({
    titulo: "Reporte del día",
    bajada: day,
    cuerpo: `<table role="presentation" style="width:100%;border-collapse:collapse;">
      ${fila("Ventas del día", money(revenue))}
      ${fila("Órdenes", String(orders))}
      ${fila("Inversión en pauta", money(spend))}
      ${fila("Compras atribuidas", String(purchases))}
    </table>`,
    boton: { texto: "Ver el reporte completo", href: `${appUrl()}/dashboard/reportes` },
    pie: "El PDF con el detalle va adjunto a este correo.",
  });
}

/**
 * Aviso a un editor: le asignaron algo y tiene fecha.
 *
 * Sin cifras de dinero a propósito — los editores no las ven dentro de la app
 * y el correo no puede ser la puerta de atrás.
 */
export function avisoEditorHtml({
  nombre,
  tarea,
  producto,
  fecha,
  quienAsigno,
}: {
  nombre: string;
  tarea: string;
  producto?: string | null;
  fecha?: Date | null;
  quienAsigno?: string | null;
}) {
  const cuando = fecha
    ? fecha.toLocaleDateString("es-EC", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      })
    : "sin fecha definida";

  return envoltorio({
    titulo: "Tenés algo asignado",
    bajada: `Hola, ${nombre}`,
    cuerpo: `<table role="presentation" style="width:100%;border-collapse:collapse;">
      ${fila("Tarea", tarea)}
      ${producto ? fila("Producto", producto) : ""}
      ${fila("Entrega", cuando)}
      ${quienAsigno ? fila("Te lo asignó", quienAsigno) : ""}
    </table>`,
    boton: { texto: "Abrir en el panel", href: `${appUrl()}/dashboard/contenido?vista=tablero` },
    pie: "Si ya lo entregaste, marcalo en el tablero para que el equipo lo vea.",
  });
}

/**
 * Recuperación de contraseña. El enlace vive poco y se usa una sola vez.
 */
export function recuperarClaveHtml({ nombre, enlace, minutos }: { nombre: string; enlace: string; minutos: number }) {
  return envoltorio({
    titulo: "Restablecer tu contraseña",
    bajada: `Hola, ${nombre}`,
    cuerpo: `<p style="margin:0;font-size:14px;line-height:1.6;color:#1a1a1a;">
      Pediste volver a entrar a tu cuenta. El botón de abajo te lleva a elegir una contraseña nueva.
    </p>`,
    boton: { texto: "Elegir contraseña nueva", href: enlace },
    pie: `El enlace vence en ${minutos} minutos y sirve una sola vez. Si no fuiste vos, ignorá este correo: tu contraseña actual sigue funcionando.`,
  });
}

/**
 * A quién le llega el reporte diario.
 *
 * Se filtra por `canViewFinancials` y no solo por el rol: el correo lleva
 * ventas e inversión, y hay dueños que no tienen ese permiso. Es el mismo
 * criterio que usa la notificación dentro de la app.
 */
export async function reportRecipients(organizationId: string) {
  const owners = await db.user.findMany({
    where: { organizationId, role: "OWNER", canViewFinancials: true },
    select: { email: true },
  });
  return owners.map((o) => o.email);
}
