import { db } from "@/lib/db";
import { fetchWindsorAdRows, type WindsorConnector } from "./windsor";

// Los anuncios de cada campaña, desde Windsor.
//
// Va aparte de la sincronización de campañas a propósito: son muchas más filas
// (cada campaña tiene varios anuncios, por siete días) y si Windsor rechaza un
// campo de anuncio no puede arrastrar a la de campañas, que es de la que
// dependen el panel y el control. Corre cada 30 minutos, no cada 5: lo que se
// decide con los anuncios (qué creativo escalar) no cambia de un rato a otro.

const CADA_MINUTOS = 30;
const LOTE = 500;
/** Cuántos días de historia por anuncio se guardan. */
const RETENCION_DIAS = 120;

const PLATAFORMA: Record<WindsorConnector, "META" | "TIKTOK"> = { facebook: "META", tiktok: "TIKTOK" };

export async function sincronizarAnuncios(organizationId: string, connector: WindsorConnector) {
  const fuente = `anuncios-${connector}`;
  const estado = await db.syncState.findUnique({
    where: { organizationId_fuente: { organizationId, fuente } },
    select: { okAt: true, errorAt: true },
  });
  const ultimo = Math.max(estado?.okAt?.getTime() ?? 0, estado?.errorAt?.getTime() ?? 0);
  if (Date.now() - ultimo < CADA_MINUTOS * 60_000) return null;

  const marcar = (datos: { detalle?: string; error?: string }) =>
    db.syncState.upsert({
      where: { organizationId_fuente: { organizationId, fuente } },
      create: {
        organizationId,
        fuente,
        ...(datos.error ? { errorAt: new Date(), error: datos.error } : { okAt: new Date(), detalle: datos.detalle, error: null }),
      },
      update: datos.error ? { errorAt: new Date(), error: datos.error } : { okAt: new Date(), detalle: datos.detalle, error: null },
    });

  try {
    // La primera vez se trae un mes, para que la ficha no arranque vacía;
    // después, la semana, que es lo que Meta sigue ajustando.
    const hayHistoria = await db.adCreativoDia.findFirst({
      where: { ad: { campaign: { adAccount: { organizationId, platform: PLATAFORMA[connector] } } } },
      select: { id: true },
    });
    const { filas, campos } = await fetchWindsorAdRows(connector, hayHistoria ? "last_7dT" : "last_30dT");

    // EL MISMO SILENCIO QUE EN LA SINCRONIZACIÓN DE CAMPAÑAS, EN OTRA PUERTA.
    //
    // La alarma por cero filas se puso en windsor-sync.ts cuando TikTok dejó de
    // traer datos sin avisar. Pero ESTA función es otra puerta a la misma API y
    // había quedado como estaba: con cero filas guardaba okAt y "0 días" como
    // detalle, sin una sola marca de error.
    //
    // Se vio en la base. El 4 de octubre a las 7:10 TikTok se cortó; la
    // sincronización de campañas ya lo grita, y la de anuncios seguía diciendo
    // "1535 anuncios (0 nuevos), 0 días" como si todo estuviera bien. Un
    // arreglo que tapa una de dos puertas no es un arreglo.
    //
    // Mismo criterio que allá: si esta plataforma YA TIENE anuncios cargados y
    // hoy no vuelve ni una fila, está rota. Sin historia no se dispara, porque
    // una cuenta recién conectada no tiene con qué compararse.
    if (filas.length === 0 && hayHistoria) {
      throw new Error(
        `Windsor no devolvió ninguna fila de anuncios para ${connector}, y esta ` +
          `organización ya tenía anuncios cargados. Revisá esa conexión en Windsor.`,
      );
    }

    // Las campañas ya existen (las crea la sincronización de campañas): acá
    // solo se cuelgan de ellas. Un anuncio de una campaña que todavía no
    // llegó se saltea y entra en la vuelta siguiente.
    const campanas = await db.campaign.findMany({
      where: { adAccount: { organizationId, platform: PLATAFORMA[connector] } },
      select: { id: true, externalId: true, adAccount: { select: { externalId: true } } },
    });
    const campanaDe = new Map(campanas.map((c) => [`${c.adAccount.externalId}|${c.externalId}`, c.id]));

    const existentes = await db.adCreativo.findMany({
      where: { campaignId: { in: campanas.map((c) => c.id) } },
      select: { id: true, campaignId: true, externalId: true, nombre: true, grupo: true, miniaturaUrl: true },
    });
    const adDe = new Map(existentes.map((a) => [`${a.campaignId}|${a.externalId}`, a]));

    const porGuardar: {
      adId: string;
      capturedAt: Date;
      spend: number;
      impressions: number;
      clicks: number;
      purchases: number;
      revenue: number;
    }[] = [];
    let salteadas = 0;
    let nuevos = 0;

    for (const f of filas) {
      const campaignId = campanaDe.get(`${f.account_id}|${f.campaign_id}`);
      if (!campaignId) {
        salteadas += 1;
        continue;
      }
      const clave = `${campaignId}|${f.ad_id}`;
      let ad = adDe.get(clave);
      if (!ad) {
        ad = await db.adCreativo.upsert({
          where: { campaignId_externalId: { campaignId, externalId: f.ad_id } },
          create: { campaignId, externalId: f.ad_id, nombre: f.ad_name, grupo: f.grupo, miniaturaUrl: f.miniatura },
          update: { nombre: f.ad_name, grupo: f.grupo, ...(f.miniatura ? { miniaturaUrl: f.miniatura } : {}) },
          select: { id: true, campaignId: true, externalId: true, nombre: true, grupo: true, miniaturaUrl: true },
        });
        adDe.set(clave, ad);
        nuevos += 1;
      } else if (ad.nombre !== f.ad_name || (f.grupo && ad.grupo !== f.grupo) || (f.miniatura && ad.miniaturaUrl !== f.miniatura)) {
        ad = await db.adCreativo.update({
          where: { id: ad.id },
          data: { nombre: f.ad_name, ...(f.grupo ? { grupo: f.grupo } : {}), ...(f.miniatura ? { miniaturaUrl: f.miniatura } : {}) },
          select: { id: true, campaignId: true, externalId: true, nombre: true, grupo: true, miniaturaUrl: true },
        });
        adDe.set(clave, ad);
      }
      porGuardar.push({
        adId: ad.id,
        capturedAt: new Date(`${f.date}T00:00:00.000Z`),
        spend: f.spend,
        impressions: Math.round(f.impressions),
        clicks: Math.round(f.clicks),
        purchases: Math.round(f.purchases),
        revenue: f.revenue,
      });
    }

    // Igual que las campañas: lo que dice Windsor para esos días reemplaza lo
    // que había, por lotes.
    for (let i = 0; i < porGuardar.length; i += LOTE) {
      const lote = porGuardar.slice(i, i + LOTE);
      await db.adCreativoDia.deleteMany({
        where: { OR: lote.map((s) => ({ adId: s.adId, capturedAt: s.capturedAt })) },
      });
      await db.adCreativoDia.createMany({ data: lote, skipDuplicates: true });
    }

    // La historia vieja no se usa en ninguna pantalla y la base es chica.
    await db.adCreativoDia.deleteMany({
      where: {
        capturedAt: { lt: new Date(Date.now() - RETENCION_DIAS * 86_400_000) },
        // Solo lo de esta organización: sin esto, sincronizar una borraría la
        // historia de anuncios de todas.
        ad: { campaign: { adAccount: { organizationId } } },
      },
    });

    const detalle = `${adDe.size} anuncios (${nuevos} nuevos), ${porGuardar.length} días${
      salteadas ? `, ${salteadas} filas sin campaña todavía` : ""
    } · campos: ${campos.join(",")}`;
    await marcar({ detalle });
    return detalle;
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    await marcar({ error: mensaje.slice(0, 500) });
    throw err;
  }
}
