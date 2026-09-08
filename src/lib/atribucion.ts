import { db } from "@/lib/db";
import type { Range } from "@/lib/date-range";

// El cruce entre lo que se vendió y lo que la pauta dice haber generado.
//
// Meta y TikTok casi nunca coinciden con Shopify, y la diferencia no es un
// error: es información. Pero para leerla hace falta separar de dónde sale.
// Una parte se explica sola —quien vuelve a comprar no llegó por un anuncio
// nuevo— y lo que queda después de descontar eso es lo que de verdad hay que
// mirar.
//
// POR QUÉ SQL CRUDO ACÁ Y NO LA API DE PRISMA
// Decidir si un pedido es recompra exige mirar todo el historial de ese
// cliente, no solo el período. Con la API habría que bajar los pedidos del
// rango (quince mil en treinta días), sacar la lista de clientes y volver a
// preguntar cuáles ya habían comprado antes — dos viajes y toda esa memoria
// en Node para un par de números. Una función de ventana lo resuelve dentro
// de la base, que es donde viven los datos.

export type CompraRepetida = {
  /** Pedidos del período de clientes que compran por primera vez. */
  primeraCompra: number;
  /** Pedidos del período de clientes que ya habían comprado antes. */
  recompra: number;
  /** Pedidos sin teléfono ni correo: no se puede saber. */
  sinIdentificar: number;
};

/**
 * Separa los pedidos del período entre primera compra y recompra.
 *
 * El cliente se identifica por teléfono, y si no hay, por correo. Es lo que
 * hay: Shopify no da un identificador de persona en este flujo, y en venta
 * contraentrega el teléfono es el dato que siempre está.
 */
export async function compraRepetida(
  organizationId: string,
  range: Range,
): Promise<CompraRepetida> {
  const filas = await db.$queryRaw<
    { primera: bigint; repetida: bigint; anonima: bigint }[]
  >`
    WITH pedidos AS (
      SELECT o."occurredAt",
             coalesce(nullif(o."clienteTelefono", ''), nullif(o."clienteEmail", '')) AS cliente
      FROM "ShopifyOrder" o
      JOIN "ShopifyStore" s ON s.id = o."storeId"
      WHERE s."organizationId" = ${organizationId}
    ),
    numerados AS (
      SELECT "occurredAt",
             cliente,
             CASE
               WHEN cliente IS NULL THEN NULL
               -- El orden es sobre TODO el historial, no sobre el período: si
               -- se numerara solo dentro del rango, la segunda compra de un
               -- cliente viejo aparecería como si fuera la primera.
               ELSE row_number() OVER (PARTITION BY cliente ORDER BY "occurredAt")
             END AS n
      FROM pedidos
    )
    SELECT
      count(*) FILTER (WHERE n = 1)            AS primera,
      count(*) FILTER (WHERE n > 1)            AS repetida,
      count(*) FILTER (WHERE cliente IS NULL)  AS anonima
    FROM numerados
    WHERE "occurredAt" >= ${range.from} AND "occurredAt" <= ${range.to}
  `;

  const f = filas[0];
  return {
    primeraCompra: Number(f?.primera ?? 0),
    recompra: Number(f?.repetida ?? 0),
    sinIdentificar: Number(f?.anonima ?? 0),
  };
}

// ---------------------------------------------------------------------------

export type LecturaCruce = {
  /** Órdenes que la pauta no explica. Cero si se atribuye de más. */
  brecha: number;
  /** Cuánto de esa brecha se explica con clientes que ya habían comprado. */
  porRecompra: number;
  /** Lo que queda sin explicación después de descontar la recompra. */
  sinExplicar: number;
  /** Atribuidas ÷ reales. Por encima de 1 hay doble conteo entre plataformas. */
  sobreatribucion: number | null;
  /** Qué tan grande es lo inexplicado sobre el total. 0 a 1. */
  pesoSinExplicar: number;
  /** Si merece un aviso al equipo. */
  alerta: boolean;
  /** La lectura en palabras, para mostrar y para notificar. */
  mensaje: string;
};

/** A partir de cuánto lo inexplicado deja de ser ruido y pasa a ser un aviso. */
export const UMBRAL_SIN_EXPLICAR = 0.25;

/**
 * Convierte los números en una lectura.
 *
 * La cadena es siempre la misma: de las órdenes reales se descuenta lo que la
 * pauta se atribuye; de lo que sobra se descuenta la recompra; y lo que queda
 * después de eso es lo único que amerita preguntar.
 */
export function leerCruce({
  ordenesReales,
  atribuidas,
  recompra,
}: {
  ordenesReales: number;
  atribuidas: number;
  recompra: number;
}): LecturaCruce {
  const sobreatribucion = ordenesReales > 0 ? atribuidas / ordenesReales : null;
  const brecha = Math.max(0, ordenesReales - atribuidas);
  // La recompra solo puede explicar hasta el tamaño de la brecha: si hay 200
  // recompras y la brecha es de 50, sobran recompras, no faltan pedidos.
  const porRecompra = Math.min(recompra, brecha);
  const sinExplicar = brecha - porRecompra;
  const pesoSinExplicar = ordenesReales > 0 ? sinExplicar / ordenesReales : 0;

  let mensaje: string;
  if (ordenesReales === 0) {
    mensaje = "No hay órdenes en el período, así que no hay nada que cruzar.";
  } else if (brecha === 0) {
    mensaje =
      sobreatribucion != null && sobreatribucion > 1.3
        ? `Meta y TikTok se atribuyen ${atribuidas.toLocaleString("es-EC")} compras contra ${ordenesReales.toLocaleString("es-EC")} órdenes reales: ${sobreatribucion.toFixed(1)} veces más. Es doble conteo entre las dos plataformas, no ventas de más.`
        : "Lo que atribuye la pauta cuadra con lo que entró en Shopify.";
  } else if (sinExplicar === 0) {
    mensaje = `De las ${ordenesReales.toLocaleString("es-EC")} órdenes, la pauta explica ${atribuidas.toLocaleString("es-EC")} y las ${porRecompra.toLocaleString("es-EC")} restantes son de clientes que ya habían comprado. Todo cuadra.`;
  } else {
    mensaje = `Quedan ${sinExplicar.toLocaleString("es-EC")} órdenes que no explica ni la pauta ni la recompra — ${Math.round(pesoSinExplicar * 100)}% del total. Suelen venir de mensajes directos, de gente que entró por el link sin pasar por un anuncio, o de campañas sin la nomenclatura que las conecta con su producto.`;
  }

  return {
    brecha,
    porRecompra,
    sinExplicar,
    sobreatribucion,
    pesoSinExplicar,
    alerta: pesoSinExplicar >= UMBRAL_SIN_EXPLICAR,
    mensaje,
  };
}

// ---------------------------------------------------------------------------

/** Cuántas horas deben pasar entre dos avisos de descuadre. */
const CADA_HORAS = 20;

/**
 * Avisa a la dirección cuando la diferencia entre pedidos y pauta es grande.
 *
 * Se mira sobre los últimos 7 días y no sobre el día en curso: la atribución
 * de Meta llega con retraso, así que un solo día siempre parece descuadrado a
 * media tarde y el aviso perdería sentido de tanto repetirse.
 *
 * Solo avisa cuando lo inexplicado —después de descontar la recompra— pasa el
 * umbral. Un aviso que salta siempre se ignora igual que uno que no sale.
 */
export async function avisarDescuadre(organizationId: string) {
  const FUENTE = "descuadre-atribucion";

  const estado = await db.syncState.findUnique({
    where: { organizationId_fuente: { organizationId, fuente: FUENTE } },
    select: { okAt: true },
  });
  if (estado?.okAt && Date.now() - estado.okAt.getTime() < CADA_HORAS * 3600_000) return null;

  const hasta = new Date();
  const desde = new Date(hasta.getTime() - 7 * 24 * 3600_000);
  const rango = { from: desde, to: hasta } as Range;

  const [ordenesReales, atribuidasAgg, repetida] = await Promise.all([
    db.shopifyOrder.count({
      where: { store: { organizationId }, occurredAt: { gte: desde, lte: hasta } },
    }),
    db.metricSnapshot.aggregate({
      _sum: { purchases: true },
      where: {
        capturedAt: { gte: desde, lte: hasta },
        campaign: { adAccount: { organizationId } },
      },
    }),
    compraRepetida(organizationId, rango),
  ]);

  const cruce = leerCruce({
    ordenesReales,
    atribuidas: atribuidasAgg._sum.purchases ?? 0,
    recompra: repetida.recompra,
  });

  const marcar = (detalle: string) =>
    db.syncState.upsert({
      where: { organizationId_fuente: { organizationId, fuente: FUENTE } },
      create: { organizationId, fuente: FUENTE, okAt: new Date(), detalle },
      update: { okAt: new Date(), detalle, error: null },
    });

  if (!cruce.alerta) {
    // Se marca igual: no hay nada que avisar, pero tampoco hay que recalcular
    // esto cada cinco minutos.
    await marcar(`sin descuadre (${Math.round(cruce.pesoSinExplicar * 100)}%)`);
    return null;
  }

  const direccion = await db.user.findMany({
    where: { organizationId, role: { in: ["OWNER", "DIRECTOR"] } },
    select: { id: true },
  });

  for (const persona of direccion) {
    await db.notification.create({
      data: {
        userId: persona.id,
        type: "alert_discrepancia",
        message: `Descuadre de pedidos en los últimos 7 días. ${cruce.mensaje}`,
        link: "/dashboard",
      },
    });
  }

  await marcar(`avisado: ${cruce.sinExplicar} sin explicar`);
  return cruce;
}
