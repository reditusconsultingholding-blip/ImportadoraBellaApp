import { db } from "@/lib/db";
import { syncShopifyStore } from "@/lib/integrations/shopify-sync";
import { rellenarClientes } from "@/lib/relleno-clientes";
import { diaDelReportePendiente } from "@/lib/reporte-horario";
import { syncWindsorConnector } from "@/lib/integrations/windsor-sync";
import { sincronizarAnuncios } from "@/lib/integrations/windsor-anuncios";
import { hasWindsorKey, intervaloDeWindsor, type WindsorConnector } from "@/lib/integrations/windsor";
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
import { repasoDiarioDeCierres, rellenarCierres } from "@/lib/control-relleno";
import { resincronizacionProfunda } from "@/lib/resync-profundo";
import { recifrarPendientes } from "@/lib/cifrado-repaso";
import { precalentarPantallas } from "@/lib/precalentar";
import { limpiarActividadVieja } from "@/lib/actividad";
import { estadoDelCorreo } from "@/lib/email";
import { sincronizarReporteVentas } from "@/lib/integrations/reporte-ventas";
import { descuadreDelControl } from "@/lib/control-cuadre";

let ultimaLimpiezaActividad = "";
/** Cuándo se revisó por última vez el correo saliente. */
let ultimoCorreo = 0;
/** Cuándo se miró por última vez la planilla de pedidos del equipo de ventas. */
const ultimoReporte = new Map<string, number>();
const REPORTE_CADA_MS = 60 * 60 * 1000;

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

// La vuelta rápida: Shopify, Meta y TikTok.
//
// "Se demora en cargar la información de Windsor": todo corría en una sola
// vuelta de cinco minutos, en fila —ventas, pauta, anuncios, Notion, reportes,
// avisos, precalentado—, y si algo de eso tardaba la vuelta siguiente se
// salteaba entera. La pauta podía quedar diez o quince minutos atrás. Ahora
// ventas y pauta van solas cada dos minutos y no esperan a nadie.
const RAPIDO_CADA_MS = 2 * 60 * 1000;

// Cuántos días se piden en cada vuelta rápida. Hoy y los dos anteriores es lo
// que se mueve de un rato a otro; la semana completa (Meta sigue ajustando
// compras hasta siete días después) se repasa cada media hora.
const PRESET_CORTO = "last_3dT";
const PRESET_LARGO = "last_7dT";
const SEMANA_CADA_MS = 30 * 60 * 1000;
const ultimaSemana = new Map<string, number>();

// Arranca un rato después de levantar el proceso: durante un despliegue las
// dos instancias conviven unos segundos y no tiene sentido que las dos salgan
// a sincronizar al mismo tiempo.
const ESPERA_INICIAL_MS = 45 * 1000;

// Si una corrida quedó marcada como "corriendo" más tiempo que esto, se asume
// que el proceso murió a mitad de camino. Sin esto, un reinicio en el momento
// justo dejaría el candado puesto para siempre.
// Con margen para un mal día de Windsor: un pedido puede reintentarse
// varias veces con hasta tres minutos de espera cada uno, y si el candado
// venciera antes, una segunda vuelta entraría a escribir las mismas filas.
const CANDADO_VENCE_MS = 25 * 60 * 1000;

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

/** Trae la pauta de un conector; si el rango corto no existe en Windsor, cae al largo. */
async function traerPauta(organizationId: string, conector: WindsorConnector) {
  const clave = `${organizationId}|${conector}`;
  const toca = Date.now() - (ultimaSemana.get(clave) ?? 0) > SEMANA_CADA_MS;
  if (toca) {
    const r = await syncWindsorConnector(organizationId, conector, PRESET_LARGO);
    ultimaSemana.set(clave, Date.now());
    return { ...r, rango: "7 días" };
  }
  try {
    return { ...(await syncWindsorConnector(organizationId, conector, PRESET_CORTO)), rango: "3 días" };
  } catch {
    const r = await syncWindsorConnector(organizationId, conector, PRESET_LARGO);
    ultimaSemana.set(clave, Date.now());
    return { ...r, rango: "7 días" };
  }
}

/**
 * Cuándo llegaron datos nuevos de verdad de un conector, y con qué intervalo
 * está refrescando Windsor. Es lo que usa el contador del encabezado ("datos
 * de las 12:40 · próxima actualización en 14:32"). Preguntar no es lo mismo
 * que recibir algo nuevo: se marca solo cuando algún número cambió.
 */
async function anotarFrescura(organizationId: string, conector: WindsorConnector, llegoAlgoNuevo: boolean) {
  const fuente = `frescura-${conector}`;
  const detalle = intervaloDeWindsor(conector) ?? "6h";
  await db.syncState
    .upsert({
      where: { organizationId_fuente: { organizationId, fuente } },
      create: { organizationId, fuente, detalle, okAt: llegoAlgoNuevo ? new Date() : null },
      update: llegoAlgoNuevo ? { detalle, okAt: new Date() } : { detalle },
    })
    .catch(() => {});
}

/** Deja constancia de cuánto tardó una vuelta, para poder medirlo. */
async function anotarVuelta(organizationId: string, fuente: string, inicio: number, detalle: string) {
  const s = ((Date.now() - inicio) / 1000).toFixed(1);
  await db.syncState
    .upsert({
      where: { organizationId_fuente: { organizationId, fuente } },
      create: { organizationId, fuente, okAt: new Date(), detalle: `${s}s · ${detalle}`.slice(0, 500) },
      update: { okAt: new Date(), detalle: `${s}s · ${detalle}`.slice(0, 500), error: null },
    })
    .catch(() => {});
}

/**
 * La vuelta rápida: ventas de Shopify y pauta de Meta y TikTok, y después
 * dejar calculado el panel con lo nuevo. Cada dos minutos.
 */
export async function sincronizarRapido() {
  const orgs = await db.organization.findMany({ select: { id: true } });
  const resumen: Record<string, string> = {};
  for (const org of orgs) {
    const inicio = Date.now();
    let cambio = false;
    // Lo de ESTA organización. El resumen general se devuelve igual para el
    // registro, pero lo que se guarda en su SyncState es solo lo suyo.
    const mio: Record<string, string> = {};
    const anotar = (clave: string, valor: string) => {
      resumen[clave] = valor;
      mio[clave] = valor;
    };

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
        anotar("shopify", `${r.ordersSynced} órdenes`);
        // Solo cuenta como cambio si entró o se modificó alguna orden.
        if (r.creadas + r.actualizadas > 0) cambio = true;
        await soltarCandado(org.id, "shopify", { ok: true, detalle: mio.shopify });
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : String(err);
        anotar("shopify", `error: ${mensaje}`);
        await soltarCandado(org.id, "shopify", { ok: false, error: mensaje });
      }
    }

    if (hasWindsorKey()) {
      // Meta y TikTok a la vez: son dos pedidos a Windsor independientes, y
      // en fila uno esperaba al otro sin motivo.
      await Promise.all(
        CONECTORES.map(async (conector) => {
          if (!(await tomarCandado(org.id, conector))) {
            anotar(conector, "ya estaba corriendo");
            return;
          }
          const t = Date.now();
          try {
            const r = await traerPauta(org.id, conector);
            if (r.cambiados > 0) cambio = true;
            await anotarFrescura(org.id, conector, r.cambiados > 0);
            anotar(
              conector,
              `${r.campaigns} campañas, ${r.cambiados} días cambiados de ${r.rango} en ${((Date.now() - t) / 1000).toFixed(1)}s`,
            );
            await soltarCandado(org.id, conector, { ok: true, detalle: mio[conector] });
          } catch (err) {
            const mensaje = err instanceof Error ? err.message : String(err);
            anotar(conector, `error: ${mensaje}`);
            await soltarCandado(org.id, conector, { ok: false, error: mensaje });
          }
        }),
      );
    }

    // Solo si entró algo nuevo: si no cambió nada, la memoria no se vació y
    // el panel sigue calculado.
    if (cambio) {
      try {
        anotar("precalentado", await precalentarPantallas(org.id, true));
      } catch (err) {
        anotar("precalentado", `error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await anotarVuelta(org.id, "reloj-rapido", inicio, Object.entries(mio).map(([k, v]) => `${k}: ${v}`).join(" | "));
  }
  return resumen;
}

/**
 * Una vuelta completa. La llama el reloj interno y también el cron externo,
 * así que tiene que ser segura de correr dos veces seguidas.
 *
 * @param conRapido Si incluye ventas y pauta. El reloj interno la llama sin
 * ellas, porque de eso se encarga la vuelta rápida; el cron externo (el
 * respaldo) la llama completa.
 */
export async function sincronizarTodo(conRapido = true) {
  const orgs = await db.organization.findMany({ select: { id: true } });
  const resumen: Record<string, string> = conRapido ? await sincronizarRapido() : {};

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
    // El cronómetro arranca con cada organización: si no, la segunda
    // informaría también el tiempo de la primera.
    const inicioLento = Date.now();
    // Ventas y pauta van en la vuelta rápida (sincronizarRapido). Acá queda
    // lo que puede esperar unos minutos sin que nadie lo note.
    if (hasWindsorKey()) {
      // Los anuncios de cada campaña, cada 30 minutos (el control de
      // frecuencia vive adentro). Van después de las campañas porque se
      // cuelgan de ellas, y un error acá no toca lo de arriba.
      for (const conector of CONECTORES) {
        const fuente = `anuncios-${conector}`;
        // Con candado, como los conectores: el reloj interno y el cron externo
        // pueden coincidir, y dos sincronizaciones de anuncios a la vez
        // escriben las mismas filas de AdCreativoDia.
        if (!(await tomarCandado(org.id, fuente))) {
          resumen[fuente] = "ya estaba corriendo";
          continue;
        }
        try {
          const r = await sincronizarAnuncios(org.id, conector);
          if (r) {
            resumen[fuente] = r;
            await soltarCandado(org.id, fuente, { ok: true, detalle: r });
          } else {
            // No le tocaba (su control de frecuencia son 30 minutos): se
            // suelta el candado sin mover okAt, que es justo lo que mide esos
            // 30 minutos. Marcarlo acá lo reiniciaría en cada vuelta.
            await db.syncState
              .update({ where: { organizationId_fuente: { organizationId: org.id, fuente } }, data: { corriendo: false } })
              .catch(() => {});
          }
        } catch (err) {
          const mensaje = err instanceof Error ? err.message : String(err);
          resumen[fuente] = `error: ${mensaje}`;
          await soltarCandado(org.id, fuente, { ok: false, error: mensaje });
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

    // La planilla de pedidos del equipo de ventas, una vez por hora.
    //
    // Es la fuente de los pedidos del control publicitario, así que después de
    // traerla hay que rehacer los cierres de los días que cambiaron: si no, la
    // planilla queda actualizada y la pantalla sigue mostrando el conteo viejo.
    // Se rehace desde hace siete días y no desde siempre —catorce meses de
    // cierres por hora sería absurdo—; un mes viejo que cambie entero se
    // rehace a mano desde la pantalla.
    try {
      const desdeLaUltima = Date.now() - (ultimoReporte.get(org.id) ?? 0);
      if (desdeLaUltima > REPORTE_CADA_MS) {
        ultimoReporte.set(org.id, Date.now());
        const r = await sincronizarReporteVentas(org.id);
        resumen.reporte = r.error
          ? "error: " + r.error
          : r.pestanas.length === 0
            ? "sin cambios" + (r.sinCambios.length ? " (" + r.sinCambios.join(", ") + ")" : "")
            : r.pestanas.join(", ") + ": " + r.filas + " filas en " + r.dias + " días";

        if (r.pestanas.length > 0 && r.desdeElDia) {
          // Desde el día más viejo que cambió, no "los últimos siete": la
          // planilla trae meses enteros y el equipo corrige días de atrás.
          const c = await rellenarCierres(org.id, {
            desde: new Date(r.desdeElDia),
            rehacer: true,
          });
          resumen.reporte += " · cierres rehechos: " + c.dias;
        }

        // Y se comprueba que lo que muestra el control dé lo mismo que la
        // planilla, día por día. No alcanza con rehacer cuando la planilla
        // cambia: el cierre también se corre al enlazar un nombre, y si ese
        // recálculo no llegó a correr la pantalla muestra un número viejo con
        // la misma cara que uno nuevo. Ver control-cuadre.ts.
        const d = await descuadreDelControl(org.id);
        if (d.desde) {
          const c = await rellenarCierres(org.id, { desde: d.desde, rehacer: true });
          resumen.reporte +=
            " · descuadre de " + d.pedidos + " pedidos en " + d.dias +
            " días, rehechos " + c.dias;
        }
        await anotarVuelta(org.id, "reporte-ventas", Date.now(), resumen.reporte);
      }
    } catch (err) {
      resumen.reporte = "error: " + (err instanceof Error ? err.message : String(err));
    }

    // Cómo está el correo saliente, una vez por hora. Queda escrito en
    // SyncState para poder mirarlo sin entrar a la app: "no llegan los
    // correos" casi siempre es el dominio sin verificar en Resend, y eso no
    // se veía por ningún lado.
    try {
      if (Date.now() - ultimoCorreo > 60 * 60 * 1000) {
        ultimoCorreo = Date.now();
        const e = await estadoDelCorreo();
        const base = e.error
          ? "error: " + e.error
          : e.dominio
            ? "enviando desde jarvis@" + e.dominio
            : "sin dominio verificado: Resend solo entrega al dueño de la cuenta";
        const lista = e.dominios.length
          ? " · dominios: " + e.dominios.map((d) => d.nombre + " (" + d.estado + ")").join(", ")
          : "";
        resumen.correo = base + lista;
        await anotarVuelta(org.id, "correo", Date.now(), resumen.correo);
      }
    } catch (err) {
      resumen.correo = "error: " + (err instanceof Error ? err.message : String(err));
    }

    // Lo último: dejar calculadas las pantallas con los datos recién traídos,
    // para que nadie espere el cálculo al abrirlas. Ver src/lib/precalentar.ts.
    try {
      resumen.precalentadoTodo = await precalentarPantallas(org.id);
    } catch (err) {
      resumen.precalentadoTodo = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
    await anotarVuelta(org.id, "reloj-lento", inicioLento, "notion, anuncios, reportes, avisos y precalentado");
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
  //
  // Son dos relojes: el rápido (ventas y pauta, cada dos minutos) y el lento
  // (todo lo demás, cada cinco). Cada uno se saltea si su vuelta anterior
  // sigue viva, pero ya no se frenan entre ellos: que Notion o un reporte
  // tarden no atrasa la pauta.
  let corriendoRapido = false;
  let corriendoLento = false;

  const rapida = () => {
    if (corriendoRapido) return;
    corriendoRapido = true;
    sincronizarRapido()
      .then((r) => console.log("[reloj rápido] listo:", JSON.stringify(r)))
      .catch((err) => console.error("[reloj rápido] falló:", err))
      .finally(() => {
        corriendoRapido = false;
      });
  };

  const lenta = () => {
    if (corriendoLento) {
      console.log("[reloj] la vuelta lenta anterior sigue viva, se saltea esta");
      return;
    }
    corriendoLento = true;
    sincronizarTodo(false)
      .then((r) => console.log("[reloj] vuelta lenta lista:", JSON.stringify(r)))
      .catch((err) => console.error("[reloj] falló la vuelta lenta:", err))
      .finally(() => {
        corriendoLento = false;
      });
  };

  setTimeout(rapida, ESPERA_INICIAL_MS);
  // La lenta arranca un minuto después, para no salir las dos juntas.
  setTimeout(lenta, ESPERA_INICIAL_MS + 60_000);
  guardado.__jarvisReloj = setInterval(rapida, RAPIDO_CADA_MS);
  setInterval(lenta, CADA_MS);
  console.log(`[reloj] activo: ventas y pauta cada ${RAPIDO_CADA_MS / 60000} min, el resto cada ${CADA_MS / 60000}`);
}
