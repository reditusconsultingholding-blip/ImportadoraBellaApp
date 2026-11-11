import { db } from "@/lib/db";
import { memorizar } from "@/lib/memoria";
import { normalizarNombre } from "@/lib/enlace-shopify";
import { pedidosRealesPorDia } from "@/lib/pedidos-reales";
import { cuadrar, type Cuadre } from "@/lib/shopify-vs-ads-calculo";

// Shopify contra Meta y TikTok, con los datos de la base.
//
// Las fórmulas viven en shopify-vs-ads-calculo.ts. Acá solo se juntan las tres
// fuentes por producto y por día:
//
//   - SHOPIFY: los pedidos de la tienda, con los mismos enlaces de nombres que
//     usa el control (pedidosRealesPorDia). Es "lo que me llega a Shopify".
//   - PLATAFORMAS: las compras que Meta y TikTok se atribuyen, por campaña y
//     día, tal como las trae Windsor (MetricSnapshot), separadas por
//     plataforma.
//   - EQUIPO DE VENTAS: los pedidos de la planilla de ventas y cuántos se
//     confirmaron ese día. Emilia: «una columna que salga el número de
//     pedidos que le llegue a los chicos de venta», y la confirmación por
//     día, no solo por mes.
//
// LAS CUENTAS QUE VENDEN POR WHATSAPP QUEDAN AFUERA
// Una cuenta de mensajes gasta pero no reporta compras web. Sumada, infla el
// CPA de plataforma de los productos que la usan (le pasó a NIDA y a BODY), y
// Fabrizio terminó desvinculándola de Windsor. Las cuentas marcadas «vende
// por WhatsApp» en Conexiones no entran en esta comparación; su gasto se
// informa aparte para que no desaparezca sin aviso.

const iso = (d: Date) => d.toISOString().slice(0, 10);

export type ExtraVentas = {
  /** Pedidos que le llegaron al equipo de ventas (su planilla). */
  ventas: number;
  confirmados: number;
  /** confirmados ÷ ventas. null si la planilla no tiene pedidos. */
  confirmacion: number | null;
};

export type FilaProductoCuadre = Cuadre &
  ExtraVentas & {
    productId: string | null;
    nombre: string;
    codigo: string;
    sku: string | null;
    etiquetas: string[];
    cpaObjetivo: number | null;
  };

export type FilaDiaCuadre = Cuadre & ExtraVentas & { fecha: string };

export type FilaDiaProductoCuadre = Cuadre & ExtraVentas & { fecha: string; productId: string | null };

export type ShopifyVsAds = {
  productos: FilaProductoCuadre[];
  dias: FilaDiaCuadre[];
  filas: FilaDiaProductoCuadre[];
  total: Cuadre & ExtraVentas;
  avisos: {
    /** Gasto de cuentas «vende por WhatsApp», que no entra en la comparación. */
    gastoFueraWeb: number;
    cuentasFueraWeb: string[];
  };
};

type Acum = { shopify: number; meta: number; tiktok: number; gasto: number; ventas: number; confirmados: number };
const vacio = (): Acum => ({ shopify: 0, meta: 0, tiktok: 0, gasto: 0, ventas: 0, confirmados: 0 });

function cerrar(a: Acum): Cuadre & ExtraVentas {
  return {
    ...cuadrar(a),
    ventas: a.ventas,
    confirmados: a.confirmados,
    confirmacion: a.ventas > 0 ? a.confirmados / a.ventas : null,
  };
}

async function shopifyVsAdsSinMemoria(organizationId: string, desdeDia: Date, hastaDia: Date): Promise<ShopifyVsAds> {
  // El día de Ecuador arranca a las 05:00 UTC.
  const desdeInstante = new Date(desdeDia.getTime() + 5 * 3600_000);
  const hastaInstante = new Date(hastaDia.getTime() + 29 * 3600_000);

  const [plataforma, fueraWeb, deShopify, reporte, enlaces, catalogo] = await Promise.all([
    db.$queryRaw<{ productId: string | null; fecha: Date; platform: "META" | "TIKTOK"; gasto: number; compras: number }[]>`
      SELECT c."productId", m."capturedAt" AS fecha, a.platform,
             sum(m.spend)::float8 AS gasto, sum(m.purchases)::int AS compras
        FROM "MetricSnapshot" m
        JOIN "Campaign" c ON c.id = m."campaignId"
        JOIN "AdAccount" a ON a.id = c."adAccountId"
       WHERE a."organizationId" = ${organizationId}
         AND a."ventaFueraWebAt" IS NULL
         AND m."capturedAt" >= ${desdeDia} AND m."capturedAt" <= ${hastaDia}
       GROUP BY 1, 2, 3`,
    db.$queryRaw<{ name: string; gasto: number }[]>`
      SELECT a.name, coalesce(sum(m.spend), 0)::float8 AS gasto
        FROM "AdAccount" a
        JOIN "Campaign" c ON c."adAccountId" = a.id
        JOIN "MetricSnapshot" m ON m."campaignId" = c.id
       WHERE a."organizationId" = ${organizationId}
         AND a."ventaFueraWebAt" IS NOT NULL
         AND m."capturedAt" >= ${desdeDia} AND m."capturedAt" <= ${hastaDia}
       GROUP BY a.name`,
    pedidosRealesPorDia(organizationId, desdeInstante, hastaInstante),
    db.pedidoReporte.findMany({
      where: { organizationId, fecha: { gte: desdeDia, lte: hastaDia } },
      select: { fecha: true, productoNorm: true, pedidos: true, confirmados: true },
    }),
    db.productoShopify.findMany({ where: { organizationId }, select: { nombreNorm: true, productId: true } }),
    db.product.findMany({
      where: { organizationId },
      select: { id: true, name: true, code: true, sku: true, etiquetas: true, cpaTarget: true },
    }),
  ]);

  // Producto × día.
  const celdas = new Map<string, Acum & { fecha: string; productId: string | null }>();
  const celda = (fecha: string, productId: string | null) => {
    const k = `${fecha}|${productId ?? ""}`;
    let c = celdas.get(k);
    if (!c) {
      c = { ...vacio(), fecha, productId };
      celdas.set(k, c);
    }
    return c;
  };

  for (const p of plataforma) {
    const c = celda(iso(p.fecha), p.productId);
    c.gasto += Number(p.gasto) || 0;
    if (p.platform === "META") c.meta += Number(p.compras) || 0;
    else c.tiktok += Number(p.compras) || 0;
  }

  for (const d of deShopify) {
    const fecha = iso(d.fecha);
    for (const [productId, n] of d.porProducto) celda(fecha, productId).shopify += n;
    if (d.sinAsignar > 0) celda(fecha, null).shopify += d.sinAsignar;
  }

  // La planilla de ventas se cruza con los mismos enlaces que el control
  // (ver pedidos-del-control.ts): nombre o código exacto, y los enlaces hechos
  // a mano ganan.
  const aProducto = new Map<string, string>();
  for (const p of catalogo) {
    const porNombre = normalizarNombre(p.name);
    if (porNombre) aProducto.set(porNombre, p.id);
    const porCodigo = normalizarNombre(p.code);
    if (porCodigo) aProducto.set(porCodigo, p.id);
  }
  for (const e of enlaces) aProducto.set(e.nombreNorm, e.productId);
  for (const r of reporte) {
    const c = celda(iso(r.fecha), aProducto.get(r.productoNorm) ?? null);
    c.ventas += r.pedidos;
    c.confirmados += r.confirmados;
  }

  const porProducto = new Map<string, Acum>();
  const porDia = new Map<string, Acum>();
  const total = vacio();
  const sumarEn = (a: Acum, c: Acum) => {
    a.shopify += c.shopify;
    a.meta += c.meta;
    a.tiktok += c.tiktok;
    a.gasto += c.gasto;
    a.ventas += c.ventas;
    a.confirmados += c.confirmados;
  };
  for (const c of celdas.values()) {
    const kp = c.productId ?? "";
    if (!porProducto.has(kp)) porProducto.set(kp, vacio());
    sumarEn(porProducto.get(kp)!, c);
    if (!porDia.has(c.fecha)) porDia.set(c.fecha, vacio());
    sumarEn(porDia.get(c.fecha)!, c);
    sumarEn(total, c);
  }

  const info = new Map(catalogo.map((p) => [p.id, p]));
  const productos: FilaProductoCuadre[] = [...porProducto.entries()]
    .map(([id, a]) => {
      const p = id ? info.get(id) : undefined;
      return {
        ...cerrar(a),
        productId: id || null,
        nombre: p?.name ?? "Sin producto asignado",
        codigo: p?.code ?? "",
        sku: p?.sku ?? null,
        etiquetas: p?.etiquetas ?? [],
        cpaObjetivo: p && p.cpaTarget > 0 ? p.cpaTarget : null,
      };
    })
    .filter((f) => f.shopify > 0 || f.plataforma > 0 || f.gasto > 0)
    .sort((a, b) => b.gasto - a.gasto || b.shopify - a.shopify);

  return {
    productos,
    dias: [...porDia.entries()]
      .map(([fecha, a]) => ({ fecha, ...cerrar(a) }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    filas: [...celdas.values()]
      .filter((c) => c.shopify > 0 || c.meta + c.tiktok > 0 || c.gasto > 0)
      .map((c) => ({ fecha: c.fecha, productId: c.productId, ...cerrar(c) }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    total: cerrar(total),
    avisos: {
      gastoFueraWeb: fueraWeb.reduce((t, f) => t + (Number(f.gasto) || 0), 0),
      cuentasFueraWeb: fueraWeb.filter((f) => Number(f.gasto) > 0).map((f) => f.name),
    },
  };
}

/** Shopify contra plataformas entre dos días (marcas de medianoche UTC), ambos incluidos. */
export const shopifyVsAds = memorizar("shopify-vs-ads", shopifyVsAdsSinMemoria);
