import { db } from "@/lib/db";
import { avisarAVarios } from "@/lib/push";
import { appUrl, reportRecipients, sendEmail } from "@/lib/email";
import { avisosDeHoy, textoDelAviso, type AvisoDePago } from "@/lib/pagos-recurrentes";
import { diaEcuador } from "@/lib/control-publicitario";

/**
 * Manda los recordatorios de cobro de las apps.
 *
 * El calendario —qué toca avisar hoy— vive aparte, en pagos-recurrentes.ts, sin
 * tocar la base: así se puede probar el 31 de abril y el 29 de febrero sin
 * inventar datos. Acá queda solo el envío.
 */
export async function avisarPagosDelDia(organizationId: string) {
  const pagos = await db.pagoRecurrente.findMany({
    where: { organizationId, activo: true },
    select: {
      id: true,
      nombre: true,
      monto: true,
      moneda: true,
      diaDelMes: true,
      avisarDiasAntes: true,
      activo: true,
      avisoPrevioEn: true,
      avisoDiaEn: true,
    },
  });
  if (pagos.length === 0) return null;

  // El día de Ecuador, no el del servidor: un cobro del 5 decidido con la fecha
  // UTC avisaría el 4 por la noche para quien lo lee en Guayaquil.
  const avisos = avisosDeHoy(pagos, diaEcuador());
  if (avisos.length === 0) return null;

  // Dirección, que es quien paga. Los mismos que reciben el reporte diario.
  const gente = await db.user.findMany({
    where: { organizationId, role: { in: ["OWNER", "DIRECTOR"] } },
    select: { id: true },
  });

  const link = "/dashboard/pagos";

  for (const a of avisos) {
    const texto = textoDelAviso(a);

    if (gente.length > 0) {
      await db.notification.createMany({
        data: gente.map((u) => ({
          userId: u.id,
          type: "pago_app",
          message: texto,
          link,
        })),
      });
      await avisarAVarios(
        gente.map((u) => u.id),
        {
          titulo: a.tipo === "dia" ? "Se cobra hoy" : "Cobro próximo",
          cuerpo: texto,
          url: link,
          etiqueta: `pago-${a.pago.id}`,
        },
      );
    }

    // LA MARCA SE PONE AUNQUE EL CORREO FALLE.
    //
    // Si se marcara solo al final y el correo lanzara, el aviso volvería a
    // salir en la vuelta siguiente del reloj —y la campanita ya lo mostró—.
    // Entre repetir el aviso y perder el correo de una vez, repetir es peor:
    // es lo que hace que dejen de mirarlos.
    await db.pagoRecurrente.update({
      where: { id: a.pago.id },
      data: a.tipo === "dia" ? { avisoDiaEn: a.periodo } : { avisoPrevioEn: a.periodo },
    });
  }

  await mandarCorreo(organizationId, avisos).catch(() => {
    // El correo depende de la clave de Resend, que puede no estar cargada. No
    // es motivo para tumbar la vuelta del reloj: la campanita y el push ya
    // salieron.
  });

  return `${avisos.length} aviso${avisos.length === 1 ? "" : "s"} de cobro`;
}

async function mandarCorreo(organizationId: string, avisos: AvisoDePago[]) {
  const to = await reportRecipients(organizationId);
  if (to.length === 0) return;

  const hoyMismo = avisos.filter((a) => a.tipo === "dia");
  const asunto =
    hoyMismo.length > 0
      ? `Se cobra hoy: ${hoyMismo.map((a) => a.pago.nombre).join(", ")}`
      : `Cobros próximos: ${avisos.map((a) => a.pago.nombre).join(", ")}`;

  const filas = avisos
    .map(
      (a) =>
        `<li style="margin-bottom:6px">${escapar(textoDelAviso(a))}</li>`,
    )
    .join("");

  await sendEmail({
    to,
    subject: asunto,
    html: `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a">
      <p>Recordatorio de las apps que se pagan todos los meses:</p>
      <ul style="padding-left:18px">${filas}</ul>
      <p style="color:#6b7280;font-size:13px">
        Se avisa unos días antes y el mismo día. Las fechas y los montos se cargan en
        <a href="${appUrl()}/dashboard/pagos">Pagos y suscripciones</a>.
      </p>
    </div>`,
  });
}

/** El nombre de una app lo escribe una persona: puede traer < o &. */
function escapar(t: string) {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
