import { db } from "@/lib/db";
import { syncWindsorConnector } from "@/lib/integrations/windsor-sync";
import { hasWindsorKey } from "@/lib/integrations/windsor";
import { rellenarCierres } from "@/lib/control-relleno";

// El repaso profundo: los últimos noventa días de Meta y TikTok, una vez por
// semana.
//
// POR QUÉ HACE FALTA
// El sync de cada cinco minutos pide los últimos siete días. Alcanza para lo
// que ya estaba conectado, pero no para una cuenta nueva: cuando se agrega una
// cuenta a Windsor, Jarvis empieza a ver sus datos desde ese día y nunca trae
// lo anterior. Así quedaron afuera FAJA MODA KING 1, BELLA AV y Mini UPS ONE,
// que se conectaron el 26 de agosto: en julio gastaron $1.885 que el control
// no mostraba, y el número no le cuadraba a Emilia contra su planilla.
//
// Una vez por semana es suficiente. La historia de una cuenta nueva no se
// necesita en el minuto; se necesita antes de cerrar el mes. Y noventa días
// alcanzan para cubrir el mes anterior completo aunque la cuenta se haya
// conectado a fin de mes.
//
// Después de traer los datos rehace los cierres del control publicitario de
// ese período: sin eso la historia llegaría a las métricas pero el control
// seguiría mostrando los números viejos.

const FUENTE = "resync-profundo";
const CADA_DIAS = 7;
const DIAS_ATRAS = 90;

export async function resincronizacionProfunda(organizationId: string) {
  if (!hasWindsorKey()) return null;

  const estado = await db.syncState.findUnique({
    where: { organizationId_fuente: { organizationId, fuente: FUENTE } },
    select: { okAt: true, detalle: true },
  });
  if (estado?.okAt) {
    const hace = Date.now() - estado.okAt.getTime();
    // Una corrida marcada "en curso" hace más de media hora no está en curso:
    // el servidor se reinició a la mitad —un deploy, por ejemplo— y quedó
    // abandonada. Sin esto, esa marca bloqueaba el repaso una semana entera.
    const abandonada = estado.detalle === "en curso" && hace > 30 * 60_000;
    if (!abandonada && hace < CADA_DIAS * 86400_000) return null;
  }

  // Se marca ANTES de correr. Es una operación pesada, y si el servidor se
  // reinicia a la mitad no tiene que volver a arrancar en el tick siguiente de
  // cinco minutos: espera a la semana próxima o a que se la pida a mano.
  await db.syncState.upsert({
    where: { organizationId_fuente: { organizationId, fuente: FUENTE } },
    create: { organizationId, fuente: FUENTE, okAt: new Date(), detalle: "en curso" },
    update: { okAt: new Date(), detalle: "en curso", error: null },
  });

  const partes: string[] = [];
  for (const conector of ["facebook", "tiktok"] as const) {
    try {
      const r = await syncWindsorConnector(organizationId, conector, `last_${DIAS_ATRAS}dT`);
      partes.push(`${conector} ${r.snapshots} filas`);
    } catch (err) {
      partes.push(`${conector} error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const desde = new Date(Date.now() - DIAS_ATRAS * 86400_000);
  const r = await rellenarCierres(organizationId, { desde, rehacer: true });
  partes.push(`cierres ${r.filas}`);

  const detalle = partes.join(" · ");
  await db.syncState.update({
    where: { organizationId_fuente: { organizationId, fuente: FUENTE } },
    data: { detalle },
  });
  return detalle;
}
