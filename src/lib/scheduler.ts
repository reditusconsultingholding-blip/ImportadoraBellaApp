import { db } from "@/lib/db";
import { syncShopifyStore } from "@/lib/integrations/shopify-sync";
import { rellenarClientes } from "@/lib/relleno-clientes";
import { diaDelReportePendiente } from "@/lib/reporte-horario";
import { syncWindsorConnector } from "@/lib/integrations/windsor-sync";
import { sincronizarAnuncios } from "@/lib/integrations/windsor-anuncios";
import { hasWindsorKey, type WindsorConnector } from "@/lib/integrations/windsor";
import { runAlertChecks } from "@/lib/alerts";
import { generateAndStoreDailyReport } from "@/lib/daily-report";
import { enviarReporteSemanal } from "@/lib/weekly-report";
import { enviarAlertasDiarias } from "@/lib/alertas-diarias";
import { avisarDescuadre } from "@/lib/atribucion";
import { enviarCierreDeContenido } from "@/lib/cierre-contenido";
import { sincronizarNotion } from "@/lib/integrations/notion-import";
import { avisarPendientesDelDia } from "@/lib/aviso-pendientes";
import { enviarProgresoQuincenal } from "@/lib/progreso-quincenal";
import { capturarCorte } from "@/lib/control-publicitario";
import { repasoDiarioDeCierres } from "@/lib/control-relleno";
import { resincronizacionProfunda } from "@/lib/resync-profundo";
import { recifrarPendientes } from "@/lib/cifrado-repaso";
import { precalentarPantallas } from "@/lib/precalentar";
import { limpiarActividadVieja } from "@/lib/actividad";

let ultimaLimpiezaActividad = "";

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

  // El seguimiento de actividad se guarda 90 días; lo viejo se borra una vez
  // por día (ver src/lib/actividad.ts).
  const hoyUtc = new Date().toISOString().slice(0, 10);
  if (ultimaLimpiezaActividad !== hoyUtc) {
    try {
      const n = await limpiarActividadVieja();
      ultimaLimpiezaActividad = hoyUtc;
      if (n) resumen.actividad = `${n} registros de más de 90 días borrados`;
    } catch (err) {
      resumen.actividad = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // Los tokens de terceros que quedaron sin cifrar. Ver src/lib/cifrado-repaso.ts.
  try {
    const n = await recifrarPendientes();
    if (n) resumen.cifrado = `${n} tokens cifrados`;
  } catch (err) {
    resumen.cifrado = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

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

      // Los anuncios de cada campaña, cada 30 minutos (el control de
      // frecuencia vive adentro). Van después de las campañas porque se
      // cuelgan de ellas, y un error acá no toca lo de arriba.
      for (const conector of CONECTORES) {
        try {
          const r = await sincronizarAnuncios(org.id, conector);
          if (r) resumen[`anuncios-${conector}`] = r;
        } catch (err) {
          resumen[`anuncios-${conector}`] = `error: ${err instanceof Error ? err.message : String(err)}`;
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

    // Las tareas del equipo, desde Notion.
    //
    // Estaba solo como botón en Contenido, y en la práctica se apretó una vez.
    // Ocho días después el tablero del día seguía mostrando aquella jornada
    // mientras el equipo cargaba su trabajo en Notion todos los días: para
    // quien lo miraba, la herramienta "no mostraba lo de hoy". Una función que
    // hay que acordarse de ejecutar no es una sincronización.
    try {
      const r = await sincronizarNotion(org.id);
      if (r) resumen.notion = r;
    } catch (err) {
      resumen.notion = `error: ${err instanceof Error ? err.message : String(err)}`;
    }

    // Una vez por semana, los últimos noventa días de Meta y TikTok. Trae la
    // historia de las cuentas que se conectaron tarde, que el sync de siete
    // días nunca alcanza. Ver src/lib/resync-profundo.ts.
    try {
      const r = await resincronizacionProfunda(org.id);
      if (r) resumen.resyncProfundo = r;
    } catch (err) {
      resumen.resyncProfundo = `error: ${err instanceof Error ? err.message : String(err)}`;
    }

    // El repaso de los cierres de la última semana.
    //
    // Meta y TikTok siguen atribuyendo compras días después, así que el
    // cierre tomado en vivo a las 23:00 del martes se queda corto y el
    // viernes ese martes ya tiene su número real. Sin este repaso, el control
    // mostraría para siempre la versión incompleta: alguien lo miraría, no le
    // cuadraría contra la plataforma, y volvería al Excel.
    //
    // Solo días terminados: el de hoy lo escribe el corte de las 23.
    try {
      const r = await repasoDiarioDeCierres(org.id);
      if (r) resumen.cierresRepasados = r;
    } catch (err) {
      resumen.cierresRepasados = `error: ${err instanceof Error ? err.message : String(err)}`;
    }

    // La foto del día a las 8, 11, 16 y 23. Va acá y no en un servicio aparte
    // porque no se puede reconstruir después: Meta y TikTok devuelven el total
    // del día, nunca lo que llevaban a media mañana. Si no se toma en el
    // momento, esa hora se pierde.
    try {
      const r = await capturarCorte(org.id);
      if (r) resumen.corte = `${r.hora}h · ${r.productos} productos`;
    } catch (err) {
      resumen.corte = `error: ${err instanceof Error ? err.message : String(err)}`;
    }

    // A las ocho de la noche, a cada persona lo que le quedó sin cerrar. Va
    // antes del cierre de día porque cumple otra función: a las ocho todavía
    // hay tiempo de cerrar dos tareas, a las 23:59 el día ya pasó.
    try {
      const r = await avisarPendientesDelDia(org.id);
      if (r) resumen.pendientes = r;
    } catch (err) {
      resumen.pendientes = `error: ${err instanceof Error ? err.message : String(err)}`;
    }

    // El progreso de cada persona, el 15 y el último día del mes. Es lo que
    // el equipo recibe de su avance (el aviso de las 8 es solo de dirección).
    try {
      const r = await enviarProgresoQuincenal(org.id);
      if (r) resumen.progreso = r;
    } catch (err) {
      resumen.progreso = `error: ${err instanceof Error ? err.message : String(err)}`;
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

    // El cruce entre pedidos reales y lo que la pauta se atribuye. Avisa solo
    // cuando la diferencia, ya descontada la recompra, pasa el umbral: es la
    // señal de que hay ventas llegando por un camino que nadie está mirando,
    // o campañas sin la nomenclatura que las conecta con su producto.
    try {
      const r = await avisarDescuadre(org.id);
      if (r) resumen.descuadre = `${r.sinExplicar} órdenes sin explicar`;
    } catch (err) {
      resumen.descuadre = `error: ${err instanceof Error ? err.message : String(err)}`;
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

    // Lo último: dejar calculadas las pantallas con los datos recién traídos,
    // para que nadie espere el cálculo al abrirlas. Ver src/lib/precalentar.ts.
    try {
      resumen.precalentado = await precalentarPantallas(org.id);
    } catch (err) {
      resumen.precalentado = `error: ${err instanceof Error ? err.message : String(err)}`;
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
