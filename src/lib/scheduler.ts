import { db } from "@/lib/db";
import { syncShopifyStore } from "@/lib/integrations/shopify-sync";
import { syncWindsorConnector } from "@/lib/integrations/windsor-sync";
import { hasWindsorKey, type WindsorConnector } from "@/lib/integrations/windsor";
import { runAlertChecks } from "@/lib/alerts";

// El reloj de la aplicación.
//
// Antes esto vivía en un servicio de cron aparte de Railway, y el 27 de agosto
// a las 17:00 dejó de agendarse solo. Veinte horas sin sincronizar, sin un
// error a la vista: el panel mostraba "0 ventas hoy" y eso se lee como un mal
// día, no como una sincronización caída.
//
// Ahora corre adentro del servicio web, que está siempre levantado. Si el
// proceso se cae, Railway lo reinicia y el reloj arranca con él — no hay una
// segunda pieza que pueda apagarse en silencio. El cron externo sigue como
// respaldo: llama al mismo código y las dos vías se respetan el candado.

const CADA_MS = 5 * 60 * 1000;

// Arranca un rato después de levantar el proceso: durante un despliegue las
// dos instancias conviven unos segundos y no tiene sentido que las dos salgan
// a sincronizar al mismo tiempo.
const ESPERA_INICIAL_MS = 45 * 1000;

// Si una corrida quedó marcada como "corriendo" más tiempo que esto, se asume
// que el proceso murió a mitad de camino. Sin esto, un reinicio en el momento
// justo dejaría el candado puesto para siempre.
const CANDADO_VENCE_MS = 15 * 60 * 1000;

const CONECTORES: WindsorConnector[] = ["facebook", "tiktok"];

/** Toma el candado de una fuente. Devuelve false si ya hay alguien adentro. */
async function tomarCandado(organizationId: string, fuente: string) {
  const previo = await db.syncState.findUnique({
    where: { organizationId_fuente: { organizationId, fuente } },
    select: { corriendo: true, updatedAt: true },
  });

  if (previo?.corriendo) {
    const vencido = Date.now() - previo.updatedAt.getTime() > CANDADO_VENCE_MS;
    if (!vencido) return false;
  }

  await db.syncState.upsert({
    where: { organizationId_fuente: { organizationId, fuente } },
    create: { organizationId, fuente, corriendo: true },
    update: { corriendo: true },
  });
  return true;
}

async function soltarCandado(
  organizationId: string,
  fuente: string,
  resultado: { ok: true; detalle: string } | { ok: false; error: string }
) {
  await db.syncState.update({
    where: { organizationId_fuente: { organizationId, fuente } },
    data: resultado.ok
      ? { corriendo: false, okAt: new Date(), detalle: resultado.detalle, error: null }
      : { corriendo: false, errorAt: new Date(), error: resultado.error.slice(0, 500) },
  });
}

/**
 * Una vuelta completa. La llama el reloj interno y también el cron externo,
 * así que tiene que ser segura de correr dos veces seguidas.
 */
export async function sincronizarTodo() {
  const orgs = await db.organization.findMany({ select: { id: true } });
  const resumen: Record<string, string> = {};

  for (const org of orgs) {
    const tiendas = await db.shopifyStore.findMany({
      where: { organizationId: org.id, connectedAt: { not: null } },
      select: { id: true },
    });

    for (const tienda of tiendas) {
      if (!(await tomarCandado(org.id, "shopify"))) {
        resumen.shopify = "ya estaba corriendo";
        continue;
      }
      try {
        const r = await syncShopifyStore(tienda.id);
        resumen.shopify = `${r.ordersSynced} órdenes`;
        await soltarCandado(org.id, "shopify", { ok: true, detalle: resumen.shopify });
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : String(err);
        resumen.shopify = `error: ${mensaje}`;
        await soltarCandado(org.id, "shopify", { ok: false, error: mensaje });
      }
    }

    if (hasWindsorKey()) {
      for (const conector of CONECTORES) {
        if (!(await tomarCandado(org.id, conector))) {
          resumen[conector] = "ya estaba corriendo";
          continue;
        }
        try {
          // "last_7dT" y no "last_7d": la T incluye el día en curso. Sin ella
          // la pauta de hoy no existía hasta el día siguiente, y el panel
          // mostraba gasto cero a media tarde.
          const r = await syncWindsorConnector(org.id, conector, "last_7dT");
          resumen[conector] = `${r.campaigns} campañas, ${r.snapshots} días`;
          await soltarCandado(org.id, conector, { ok: true, detalle: resumen[conector] });
        } catch (err) {
          const mensaje = err instanceof Error ? err.message : String(err);
          resumen[conector] = `error: ${mensaje}`;
          await soltarCandado(org.id, conector, { ok: false, error: mensaje });
        }
      }
    }

    // Las alertas se revisan después, con los datos ya frescos.
    try {
      await runAlertChecks(org.id);
    } catch {
      // Que falle una alerta no debe tirar abajo la sincronización entera.
    }
  }

  return resumen;
}

// El reloj se guarda en globalThis y no en un módulo: en desarrollo, Next
// recarga los módulos en caliente y se acumularía un intervalo nuevo por cada
// cambio de archivo.
const guardado = globalThis as unknown as { __jarvisReloj?: NodeJS.Timeout };

export function arrancarReloj() {
  if (guardado.__jarvisReloj) return;

  const vuelta = () => {
    sincronizarTodo()
      .then((r) => console.log("[reloj] sincronización lista:", JSON.stringify(r)))
      .catch((err) => console.error("[reloj] falló la vuelta:", err));
  };

  setTimeout(vuelta, ESPERA_INICIAL_MS);
  guardado.__jarvisReloj = setInterval(vuelta, CADA_MS);
  console.log(`[reloj] activo, cada ${CADA_MS / 60000} minutos`);
}
