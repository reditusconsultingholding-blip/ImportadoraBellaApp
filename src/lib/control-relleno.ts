import { db } from "@/lib/db";
import { normalizarNombre } from "@/lib/enlace-shopify";

// El relleno del corte de cierre para los días que ya pasaron.
//
// Los cortes de las 8, las 11 y las 4 no se pueden reconstruir: las
// plataformas devuelven el total del día y nadie guardó lo que llevaban a
// media mañana. El de las 23 sí, porque es el día entero y eso es justo lo que
// quedó guardado en MetricSnapshot desde que la app sincroniza.
//
// Sin esto, el control publicitario nace vacío y solo sirve de acá en
// adelante: el equipo abriría una pantalla que le pide esperar un mes para
// poder comparar algo. Con esto abre con toda la historia que la app ya tenía.

/**
 * Marca de medianoche de Ecuador para un INSTANTE real.
 *
 * Solo para fechas con hora de verdad, como `ShopifyOrder.occurredAt`.
 */
function diaEcuador(instante: Date) {
  const local = new Date(instante.getTime() - 5 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/**
 * La misma fecha, truncada, SIN correr la zona horaria.
 *
 * `MetricSnapshot.capturedAt` no es un instante: ya es la marca del día a
 * medianoche UTC, igual que `TareaDiaria.fecha`. Restarle las cinco horas de
 * Ecuador —como sí hay que hacerle a un instante— la manda al día anterior, y
 * entonces todo el control aparece corrido: los 198 pedidos del martes se
 * muestran el lunes. Cuesta ver porque el total del mes sigue dando bien.
 */
function marcaDeDia(fecha: Date) {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
}

export type ResultadoRelleno = {
  dias: number;
  filas: number;
  desde: string | null;
  hasta: string | null;
};

/**
 * Rehace el corte de cierre de los días que ya terminaron.
 *
 * `rehacer` reescribe lo que ya estaba. Se usa todos los días sobre la última
 * semana, y no es un capricho: Meta y TikTok siguen atribuyendo compras días
 * después. El cierre tomado en vivo a las 23:00 del martes se queda corto, y
 * el viernes ese mismo martes ya tiene su número real. Sin este repaso, el
 * control mostraría para siempre la versión incompleta —que es justo lo que
 * hace que alguien mire la herramienta, no le cuadre contra la plataforma y
 * vuelva al Excel.
 *
 * Nunca toca el día en curso: un "cierre" de un día que todavía no cerró sería
 * un número a medias con nombre de definitivo. Ese lo escribe el corte de las
 * 23 cuando llegue la hora.
 */
export async function rellenarCierres(
  organizationId: string,
  opciones: { desde?: Date; rehacer?: boolean } = {},
): Promise<ResultadoRelleno> {
  const { desde, rehacer = false } = opciones;

  // Pedidos y gasto atribuidos, por día y producto.
  const plataforma = await db.$queryRaw<
    { fecha: Date; productId: string; pedidos: number; gasto: number }[]
  >`
    SELECT m."capturedAt"                          AS fecha,
           c."productId"                           AS "productId",
           coalesce(sum(m."purchases"), 0)::int    AS pedidos,
           coalesce(sum(m."spend"), 0)::float8     AS gasto
      FROM "MetricSnapshot" m
      JOIN "Campaign" c ON c.id = m."campaignId"
      JOIN "AdAccount" a ON a.id = c."adAccountId"
     WHERE a."organizationId" = ${organizationId}
       AND c."productId" IS NOT NULL
     GROUP BY m."capturedAt", c."productId"
  `;

  // Unidades reales de la tienda, por día de Ecuador y nombre de la línea.
  //
  // La normalización del nombre se hace en JavaScript y no en SQL a propósito:
  // es la misma función con la que se guardó ProductoShopify.nombreNorm, y
  // tener dos versiones —una al escribir y otra al leer— es la forma más
  // silenciosa de que un día dejen de cuadrar los números sin ningún error.
  const porNombre = await db.$queryRaw<{ fecha: Date; nombre: string; unidades: number }[]>`
    SELECT date_trunc('day', o."occurredAt" - interval '5 hours') AS fecha,
           li."productName"                                        AS nombre,
           coalesce(sum(li.quantity), 0)::int                      AS unidades
      FROM "ShopifyOrderLineItem" li
      JOIN "ShopifyOrder" o ON o.id = li."orderId"
      JOIN "ShopifyStore" s ON s.id = o."storeId"
     WHERE s."organizationId" = ${organizationId}
     GROUP BY 1, 2
  `;

  const enlaces = await db.productoShopify.findMany({
    where: { organizationId },
    select: { productId: true, nombreNorm: true },
  });
  const productoDe = new Map(enlaces.map((e) => [e.nombreNorm, e.productId]));

  const realesDe = new Map<string, number>();
  for (const r of porNombre) {
    const productId = productoDe.get(normalizarNombre(r.nombre));
    if (!productId) continue;
    // La fecha viene de date_trunc sobre la hora de Ecuador, así que ya es el
    // día correcto; solo hay que leerla como marca UTC de medianoche.
    const dia = new Date(
      Date.UTC(r.fecha.getUTCFullYear(), r.fecha.getUTCMonth(), r.fecha.getUTCDate()),
    );
    const clave = `${dia.toISOString()}|${productId}`;
    realesDe.set(clave, (realesDe.get(clave) ?? 0) + Number(r.unidades));
  }

  const existentes = await db.cortePublicitario.findMany({
    where: { organizationId, hora: 23 },
    select: { productId: true, fecha: true },
  });
  const yaEstan = new Set(existentes.map((e) => `${e.fecha.toISOString()}|${e.productId}`));

  const dias = new Set<string>();
  let filas = 0;
  let min: string | null = null;
  let max: string | null = null;

  const hoy = diaEcuador(new Date());

  for (const p of plataforma) {
    const fecha = marcaDeDia(p.fecha);
    if (desde && fecha < desde) continue;
    // El día en curso no tiene cierre todavía.
    if (fecha >= hoy) continue;
    const clave = `${fecha.toISOString()}|${p.productId}`;
    if (!rehacer && yaEstan.has(clave)) continue;

    const datos = {
      pedidos: Number(p.pedidos) || 0,
      gasto: Number(p.gasto) || 0,
      pedidosReales: realesDe.get(clave) ?? 0,
    };
    await db.cortePublicitario.upsert({
      where: {
        organizationId_productId_fecha_hora: {
          organizationId,
          productId: p.productId,
          fecha,
          hora: 23,
        },
      },
      create: { organizationId, productId: p.productId, fecha, hora: 23, ...datos },
      update: datos,
    });

    const iso = fecha.toISOString().slice(0, 10);
    dias.add(iso);
    filas += 1;
    if (!min || iso < min) min = iso;
    if (!max || iso > max) max = iso;
  }

  return { dias: dias.size, filas, desde: min, hasta: max };
}

/**
 * El repaso de una vez al día, con su propia guarda.
 *
 * Mirar catorce meses de métricas y reescribir ciento cincuenta filas cada
 * cinco minutos no le sirve a nadie: los números de anteayer no cambian tres
 * veces en una hora. Corre de madrugada, cuando las plataformas ya
 * consolidaron el día anterior, y una sola vez por día de Ecuador.
 *
 * La guarda es la misma que usan los otros trabajos diarios: una fila en
 * SyncState con la fecha del último repaso. Se compara contra el día
 * ecuatoriano y no contra "hace 24 horas", para que un repaso que salió tarde
 * un día no bloquee el del día siguiente.
 */
export async function repasoDiarioDeCierres(organizationId: string) {
  const FUENTE = "repaso-cierres";
  const HORA = 6;
  const DIAS_ATRAS = 7;

  const ahora = new Date();
  if (new Date(ahora.getTime() - 5 * 3600_000).getUTCHours() < HORA) return null;

  const hoy = diaEcuador(ahora);
  const estado = await db.syncState.findUnique({
    where: { organizationId_fuente: { organizationId, fuente: FUENTE } },
    select: { okAt: true },
  });
  if (estado?.okAt && diaEcuador(estado.okAt).getTime() === hoy.getTime()) return null;

  const desde = new Date(hoy.getTime() - DIAS_ATRAS * 86400_000);
  const r = await rellenarCierres(organizationId, { desde, rehacer: true });
  const detalle = `${r.filas} filas, ${r.dias} días`;

  await db.syncState.upsert({
    where: { organizationId_fuente: { organizationId, fuente: FUENTE } },
    create: { organizationId, fuente: FUENTE, okAt: new Date(), detalle },
    update: { okAt: new Date(), detalle, error: null },
  });

  return detalle;
}
