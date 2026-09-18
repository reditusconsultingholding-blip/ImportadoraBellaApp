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

/** Marca de medianoche de Ecuador para un instante. */
function diaEcuador(instante: Date) {
  const local = new Date(instante.getTime() - 5 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

export type ResultadoRelleno = {
  dias: number;
  filas: number;
  desde: string | null;
  hasta: string | null;
};

/**
 * Crea el corte de las 23 de cada día con datos, sin pisar lo ya capturado.
 *
 * `rehacer` fuerza la reescritura; por defecto respeta lo que haya, porque un
 * corte tomado en vivo a las 23:00 es mejor dato que este: incluye lo que las
 * plataformas todavía no habían reportado cuando se reconstruye después.
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

  for (const p of plataforma) {
    const fecha = diaEcuador(p.fecha);
    if (desde && fecha < desde) continue;
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
