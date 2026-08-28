import webpush from "web-push";
import { db } from "@/lib/db";

// Notificaciones push: el aviso llega aunque nadie tenga la app abierta.
//
// Es lo que separa una alerta útil de una que se lee tres horas tarde. Para una
// operación que decide todos los días si escala o apaga una campaña, tres horas
// son plata.
//
// Necesita dos variables de entorno con el par de claves VAPID, que es como el
// navegador verifica que el aviso viene de este servidor y no de cualquiera.

let configurado = false;

function configurar() {
  if (configurado) return true;
  const publica = process.env.VAPID_PUBLIC_KEY?.trim();
  const privada = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publica || !privada) return false;

  webpush.setVapidDetails(
    `mailto:${process.env.EMAIL_FROM_DOMAIN ? `avisos@${process.env.EMAIL_FROM_DOMAIN}` : "avisos@jarvisecom.world"}`,
    publica,
    privada
  );
  configurado = true;
  return true;
}

export function pushConfigurado() {
  return Boolean(process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim());
}

export type AvisoPush = {
  titulo: string;
  cuerpo: string;
  url?: string;
  /** Agrupa avisos: uno nuevo con la misma etiqueta reemplaza al anterior. */
  etiqueta?: string;
};

/**
 * Manda un aviso a todos los dispositivos de una persona.
 *
 * Una suscripción muerta (410 o 404) se borra en el momento: el navegador ya no
 * existe y reintentarle en cada aviso es gastar tiempo en algo que nunca va a
 * funcionar.
 */
export async function avisarA(userId: string, aviso: AvisoPush) {
  if (!configurar()) return { enviados: 0, borrados: 0 };

  const subs = await db.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  let enviados = 0;
  let borrados = 0;

  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(aviso)
      );
      enviados += 1;
      await db.pushSubscription.update({
        where: { id: s.id },
        data: { lastUsedAt: new Date() },
      });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.pushSubscription.delete({ where: { id: s.id } });
        borrados += 1;
      }
      // Cualquier otro error se ignora: que falle un aviso no debe tirar abajo
      // lo que lo disparó.
    }
  }

  return { enviados, borrados };
}

/** Manda un aviso a varias personas. */
export async function avisarAVarios(userIds: string[], aviso: AvisoPush) {
  let enviados = 0;
  for (const id of userIds) {
    const r = await avisarA(id, aviso);
    enviados += r.enviados;
  }
  return enviados;
}
