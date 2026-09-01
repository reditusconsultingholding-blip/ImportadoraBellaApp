import { db } from "@/lib/db";
import { syncShopifyStore } from "@/lib/integrations/shopify-sync";
import { rellenarClientes } from "@/lib/relleno-clientes";
import { diaDelReportePendiente } from "@/lib/reporte-horario";
import { syncWindsorConnector } from "@/lib/integrations/windsor-sync";
import { hasWindsorKey, type WindsorConnector } from "@/lib/integrations/windsor";
import { runAlertChecks } from "@/lib/alerts";
import { generateAndStoreDailyReport } from "@/lib/daily-report";
import { enviarReporteSemanal } from "@/lib/weekly-report";
import { enviarAlertasDiarias } from "@/lib/alertas-diarias";
import { enviarCierreDeContenido } from "@/lib/cierre-contenido";

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

    // El relleno de datos de cliente en las órdenes viejas. Avanza un pedazo
    // por vuelta y se acuerda de dónde quedó; cuando termina deja de correr
    // solo.
    try {
      const r = await rellenarClientes(org.id);
      if (r) resumen.relleno = r;
    } catch (err) {
      resumen.relleno = `error: ${err instanceof Error ? err.message : String(err)}`;
    }

    // Las alertas se revisan después, con los datos ya frescos.
    try {
      await runAlertChecks(org.id);
    } catch {
      // Que falle una alerta no debe tirar abajo la sincronización entera.
    }

    // El reporte del día anterior, una vez por día.
    try {
      const r = await generarReporteDelDiaAnterior(org.id);
      if (r) resumen.reporte = r;
    } catch (err) {
      resumen.reporte = `error: ${err instanceof Error ? err.message : String(err)}`;
    }

    // El cierre de día del módulo Contenido: qué hizo cada integrante. Se
    // apoya en su propia restricción de unicidad por org y día.
    try {
      const r = await enviarCierreDeContenido(org.id);
      if (r) resumen.cierreContenido = r;
    } catch (err) {
      resumen.cierreContenido = `error: ${err instanceof Error ? err.message : String(err)}`;
    }

    // Que escalar y que apagar, una vez por dia. Se apoya en su propio
    // control de frecuencia: el reloj pasa cada cinco minutos y sin eso el
    // equipo recibiria 288 avisos iguales.
    try {
      const r = await enviarAlertasDiarias(org.id);
      if (r) resumen.alertas = r;
    } catch (err) {
      resumen.alertas = `error: ${err instanceof Error ? err.message : String(err)}`;
    }

    // Y la salud de los productos, una vez por semana. Se apoya en su propia
    // restricción de unicidad, así que pasar por acá cada cinco minutos no
    // manda nada de más.
    try {
      const r = await enviarReporteSemanal(org.id);
      if (r) resumen.semanal = r;
    } catch (err) {
      resumen.semanal = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return resumen;
}

/**
 * Genera el reporte del día que cerró, si todavía no existe.
 *
 * Vive acá y no en un cron aparte porque el cron aparte se cayó: la imagen de
 * curl no tiene shell, así que la variable con la dirección nunca se expandía y
 * a medianoche moría con "Bad hostname". Nadie se enteró hasta que faltó el
 * reporte.
 *
 * Se apoya en que ya existe una restricción de unicidad por organización y día:
 * si el reporte está, no se vuelve a hacer, sin importar cuántas veces pase el
 * reloj por acá.
 */
async function generarReporteDelDiaAnterior(organizationId: string) {
  // El día que ya cerró: el reporte sale a las 23:59 de Ecuador, no a la
  // medianoche. La cuenta vive en reporte-horario.ts para que la pantalla y el
  // reloj afirmen el MISMO horario — antes cada uno lo calculaba por su lado.
  const dia = diaDelReportePendiente();

  const yaEsta = await db.dailyReport.findUnique({
    where: { organizationId_date: { organizationId, date: dia } },
    select: { id: true },
  });
  if (yaEsta) return null;

  await generateAndStoreDailyReport(organizationId, dia);
  return `generado el del ${dia.toISOString().slice(0, 10)}`;
}

// El reloj se guarda en globalThis y no en un módulo: en desarrollo, Next
// recarga los módulos en caliente y se acumularía un intervalo nuevo por cada
// cambio de archivo.
const guardado = globalThis as unknown as { __jarvisReloj?: NodeJS.Timeout };

export function arrancarReloj() {
  if (guardado.__jarvisReloj) return;

  // Una vuelta a la vez. El intervalo dispara cada cinco minutos mire o no si
  // la anterior terminó, y desde que el relleno de clientes corre acá adentro
  // una vuelta puede pasarse de esos cinco minutos. Dos vueltas encimadas
  // repetirían el mismo trabajo y se pelearían los candados.
  let corriendo = false;

  const vuelta = () => {
    if (corriendo) {
      console.log("[reloj] la vuelta anterior sigue viva, se saltea esta");
      return;
    }
    corriendo = true;
    sincronizarTodo()
      .then((r) => console.log("[reloj] sincronización lista:", JSON.stringify(r)))
      .catch((err) => console.error("[reloj] falló la vuelta:", err))
      .finally(() => {
        corriendo = false;
      });
  };

  setTimeout(vuelta, ESPERA_INICIAL_MS);
  guardado.__jarvisReloj = setInterval(vuelta, CADA_MS);
  console.log(`[reloj] activo, cada ${CADA_MS / 60000} minutos`);
}
