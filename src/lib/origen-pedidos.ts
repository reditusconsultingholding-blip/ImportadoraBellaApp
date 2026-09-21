import { db } from "@/lib/db";
import { memorizar } from "@/lib/memoria";
import { clasificarNombres } from "@/lib/pedidos-reales";
import { economiaDelMes, type Economia } from "@/lib/control-publicitario";
import type { Range } from "@/lib/date-range";

// De dónde viene CADA venta, una por una, y que la cuenta cierre.
//
// POR QUÉ OTRA VERSIÓN
// El primer reporte de origen daba "señales": cuántas ventas eran de clientes
// que volvían, cuántas de productos sin pauta, cuántas sin enlazar. Eran
// ciertas, pero se pisaban entre sí —una venta podía estar en dos— y no
// sumaban el total. Para quien tiene que dar el visto bueno eso se lee como
// "los números no cuadran". Acá cada venta cae en UNA sola caja, las cajas
// suman exactamente las ventas de la tienda, y cada venta se puede ver en la
// lista con el motivo de su caja.
//
// LAS CAJAS, EN ESTE ORDEN (la primera que aplica es la que vale)
//   1. Testeo: el producto está marcado como testeo. El control no lo cuenta.
//   2. Producto sin identificar: el nombre de Shopify no está enlazado a
//      ningún producto, así que no se puede saber si tenía pauta.
//   3. Sin pauta ese día: el producto no gastó un dólar ni en Meta ni en
//      TikTok ese día (hora de Ecuador). No la trajo un anuncio de ese día.
//   4. Con pauta ese día: el producto sí tenía campañas gastando. Se separa
//      en solo Meta, solo TikTok, o las dos.
//
// LO QUE NO SE PUEDE SABER, Y POR QUÉ
// Qué anuncio exacto trajo a cada comprador. Las ventas entran por Funnelish
// y Releasit, que cobran fuera de Shopify: la orden llega hecha y sin el
// enlace de la visita (sin utm). Por eso, dentro de la caja 4, lo que se
// compara es por producto y por día: cuántas ventas reales hubo contra
// cuántas compras se atribuyen Meta y TikTok. La diferencia es lo que los
// píxeles no reportan.
//
// Aparte, y sin ser una caja: si el comprador ya había comprado antes (mismo
// teléfono). Es un dato de cada venta, no un origen.

export type Caja = "testeo" | "sin_identificar" | "sin_pauta" | "meta" | "tiktok" | "ambas";

export const NOMBRE_CAJA: Record<Caja, string> = {
  testeo: "Testeo",
  sin_identificar: "Producto sin identificar",
  sin_pauta: "Producto sin pauta ese día",
  meta: "Pauta solo en Meta",
  tiktok: "Pauta solo en TikTok",
  ambas: "Pauta en Meta y TikTok",
};

export type VentaConOrigen = {
  /** El número de la orden en Shopify (el que se busca en el admin). */
  shopifyId: string;
  dia: string;
  hora: string;
  canal: string;
  producto: string;
  caja: Caja;
  recurrente: boolean;
  facturado: number;
};

export type ConciliacionProducto = {
  producto: string;
  ventas: number;
  meta: number;
  tiktok: number;
  /** Ventas reales que ningún píxel reportó (nunca negativo). */
  sinReportar: number;
  /** Compras que los píxeles reportaron de más sobre las ventas reales. */
  deMas: number;
};

/** Un producto en un día en que vendió más de lo que reportaron los píxeles. */
export type GrupoSinReportar = {
  dia: string;
  producto: string;
  reales: number;
  meta: number;
  tiktok: number;
  faltan: number;
  /** Los números de orden de Shopify de ese producto ese día. */
  pedidos: string[];
};

/**
 * La diferencia entre las ventas de la tienda y lo que reportan Meta y
 * TikTok, desarmada en partes que suman EXACTO.
 *
 *   ventas − reportadas = sinReportar − deMas + sinPauta + sinIdentificar
 *                         + testeo − sinProducto
 *
 * Es la respuesta a "¿de dónde son las N ventas que no se pueden rastrear?":
 * cada término es una cantidad de ventas o compras que se puede listar.
 */
export type Brecha = {
  ventas: number;
  reportadas: number;
  brecha: number;
  sinReportar: number;
  deMas: number;
  sinPauta: number;
  sinIdentificar: number;
  testeo: number;
  /** Compras que reportan campañas sin producto asignado (no se pueden cruzar). */
  sinProducto: number;
};

/** El CPA de cada día contando TODAS las ventas, contra el objetivo. */
export type CpaDelDia = {
  dia: string;
  ventas: number;
  gasto: number;
  /** Gasto total ÷ ventas reales de la tienda (todas, se rastreen o no). */
  cpaReal: number | null;
  /**
   * El CPA máximo de cada producto (Economía por producto), ponderado por
   * cuánto vendió cada uno ese día. Es el objetivo general del día: con otra
   * mezcla de productos, el objetivo cambia.
   */
  cpaObjetivo: number | null;
  /** Ventas cuyo producto tiene CPA máximo cargado (las que entran al objetivo). */
  ventasConObjetivo: number;
};

export type OrigenPorVenta = {
  total: number;
  cajas: Record<Caja, number>;
  recurrentes: number;
  canales: { canal: string; ventas: number }[];
  /** Dentro de "con pauta": lo que reportan los píxeles contra lo real. */
  conPauta: number;
  reportaMeta: number;
  reportaTiktok: number;
  sinReportar: number;
  deMas: number;
  porProducto: ConciliacionProducto[];
  ventas: VentaConOrigen[];
  /** Órdenes que traen utm o sitio de referencia (hoy, ninguna). */
  conUtm: number;
  brecha: Brecha;
  gruposSinReportar: GrupoSinReportar[];
  cpaPorDia: CpaDelDia[];
  /** El período entero: gasto total ÷ ventas totales, y su objetivo. */
  gastoTotal: number;
  cpaReal: number | null;
  cpaObjetivo: number | null;
  /**
   * Cómo se armó el objetivo: cada producto con su CPA máximo, cuántas ventas
   * pesó y de dónde salió el número. Un objetivo ponderado es tan bueno como
   * los CPA que lo forman, y el que más pesa tiene que estar a la vista.
   */
  objetivoPorProducto: { producto: string; ventas: number; cpaMax: number; deFicha: boolean }[];
  /** Ventas de productos sin ningún CPA máximo (ni del mes ni de la ficha). */
  ventasSinObjetivo: number;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function origenPorVentaSinMemoria(organizationId: string, range: Range): Promise<OrigenPorVenta> {
  const clasificados = await clasificarNombres(organizationId);
  const nombres = clasificados.map((c) => c.nombre);
  const clases = clasificados.map((c) => c.clase);
  const productos = clasificados.map((c) => c.productId ?? "");

  const desdeDia = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), range.from.getUTCDate()));
  const hastaDia = new Date(Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), range.to.getUTCDate()));

  // La economía de cada mes que toca el período, para el CPA objetivo.
  const meses: { anio: number; mes: number }[] = [];
  for (let d = new Date(desdeDia); d <= hastaDia; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    meses.push({ anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 });
  }

  const [ordenes, pauta, nombresProducto, sinProducto, economias] = await Promise.all([
    // Cada orden con UNA línea elegida, con la misma prioridad que usa el
    // control: producto enlazado > sin enlazar > testeo > envío/garantía.
    db.$queryRaw<
      {
        externalId: string;
        occurredAt: Date;
        channel: string;
        netSales: number;
        clase: string | null;
        productId: string | null;
        nombre: string | null;
        recurrente: boolean;
        conUtm: boolean;
      }[]
    >`
      WITH mapa AS (
        SELECT * FROM unnest(${nombres}::text[], ${clases}::text[], ${productos}::text[]) AS m(nombre, clase, "productId")
      ),
      ordenes AS (
        SELECT o.id, o."externalId", o."occurredAt", o.channel, o."netSales", o."clienteTelefono",
               (o."utmSource" IS NOT NULL OR o."referrerUrl" IS NOT NULL) AS "conUtm"
          FROM "ShopifyOrder" o JOIN "ShopifyStore" s ON s.id = o."storeId"
         WHERE s."organizationId" = ${organizationId}
           AND o."occurredAt" >= ${range.fromInstant} AND o."occurredAt" <= ${range.toInstant}
      ),
      linea AS (
        SELECT DISTINCT ON (li."orderId") li."orderId", m.clase, nullif(m."productId", '') AS "productId", li."productName" AS nombre
          FROM "ShopifyOrderLineItem" li
          JOIN ordenes o ON o.id = li."orderId"
          LEFT JOIN mapa m ON m.nombre = li."productName"
         ORDER BY li."orderId",
                  CASE m.clase WHEN 'producto' THEN 0 WHEN 'sin' THEN 1 WHEN 'testeo' THEN 2 ELSE 3 END,
                  li.amount DESC
      )
      SELECT o."externalId", o."occurredAt", o.channel, o."netSales", l.clase, l."productId", l.nombre, o."conUtm",
             EXISTS (
               SELECT 1 FROM "ShopifyOrder" p
                WHERE o."clienteTelefono" IS NOT NULL
                  AND p."clienteTelefono" = o."clienteTelefono"
                  AND p."occurredAt" < o."occurredAt"
             ) AS recurrente
        FROM ordenes o LEFT JOIN linea l ON l."orderId" = o.id
       ORDER BY o."occurredAt" DESC`,
    // Qué producto gastó en qué plataforma cada día, y cuántas compras se
    // atribuyó. capturedAt es la marca de día (medianoche UTC del día de
    // Ecuador), igual que en todo el resto de la app.
    db.$queryRaw<{ dia: Date; productId: string; platform: string; gasto: number; compras: number }[]>`
      SELECT m."capturedAt" AS dia, c."productId", a.platform::text AS platform,
             sum(m.spend)::float8 AS gasto, sum(m.purchases)::int AS compras
        FROM "MetricSnapshot" m
        JOIN "Campaign" c ON c.id = m."campaignId"
        JOIN "AdAccount" a ON a.id = c."adAccountId"
       WHERE a."organizationId" = ${organizationId}
         AND c."productId" IS NOT NULL
         AND m."capturedAt" >= ${desdeDia} AND m."capturedAt" <= ${hastaDia}
       GROUP BY 1, 2, 3`,
    db.product.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    // Las campañas sin producto: gastan y reportan compras, pero no se pueden
    // cruzar con ninguna venta. Entran al gasto del CPA y a la brecha.
    db.$queryRaw<{ dia: Date; gasto: number; compras: number }[]>`
      SELECT m."capturedAt" AS dia, sum(m.spend)::float8 AS gasto, sum(m.purchases)::int AS compras
        FROM "MetricSnapshot" m
        JOIN "Campaign" c ON c.id = m."campaignId"
        JOIN "AdAccount" a ON a.id = c."adAccountId"
       WHERE a."organizationId" = ${organizationId}
         AND c."productId" IS NULL
         AND m."capturedAt" >= ${desdeDia} AND m."capturedAt" <= ${hastaDia}
       GROUP BY 1`,
    Promise.all(meses.map((m) => economiaDelMes(organizationId, m.anio, m.mes))),
  ]);

  const economiaDe = new Map<string, Map<string, Economia>>();
  meses.forEach((m, i) => economiaDe.set(`${m.anio}-${String(m.mes).padStart(2, "0")}`, economias[i]));

  const nombreDe = new Map(nombresProducto.map((p) => [p.id, p.name]));

  // producto+día → gasto y compras por plataforma
  const clave = (dia: string, productId: string) => `${dia}|${productId}`;
  const pautaDe = new Map<string, { meta: number; tiktok: number; comprasMeta: number; comprasTiktok: number }>();
  for (const p of pauta) {
    const k = clave(iso(p.dia), p.productId);
    const x = pautaDe.get(k) ?? { meta: 0, tiktok: 0, comprasMeta: 0, comprasTiktok: 0 };
    if (p.platform === "META") {
      x.meta += p.gasto;
      x.comprasMeta += p.compras;
    } else if (p.platform === "TIKTOK") {
      x.tiktok += p.gasto;
      x.comprasTiktok += p.compras;
    }
    pautaDe.set(k, x);
  }

  const cajas: Record<Caja, number> = { testeo: 0, sin_identificar: 0, sin_pauta: 0, meta: 0, tiktok: 0, ambas: 0 };
  const canales = new Map<string, number>();
  const ventasConPauta = new Map<string, number>(); // producto+día → ventas reales con pauta
  const pedidosDe = new Map<string, string[]>(); // producto+día → números de orden
  // Por día: ventas, y las que tienen CPA máximo con su suma (para ponderar).
  const porDia = new Map<string, { ventas: number; conObjetivo: number; sumaObjetivo: number }>();
  const objetivoDe = new Map<string, { producto: string; ventas: number; suma: number; deFicha: boolean }>();
  let ventasSinObjetivo = 0;
  const ventas: VentaConOrigen[] = [];
  let recurrentes = 0;
  let conUtm = 0;

  for (const o of ordenes) {
    // El día y la hora de Ecuador.
    const local = new Date(o.occurredAt.getTime() - 5 * 3600_000);
    const dia = iso(local);
    const hora = local.toISOString().slice(11, 16);

    let caja: Caja;
    if (o.clase === "testeo") caja = "testeo";
    else if (o.clase !== "producto" || !o.productId) caja = "sin_identificar";
    else {
      const p = pautaDe.get(clave(dia, o.productId));
      const enMeta = (p?.meta ?? 0) > 0;
      const enTiktok = (p?.tiktok ?? 0) > 0;
      caja = enMeta && enTiktok ? "ambas" : enMeta ? "meta" : enTiktok ? "tiktok" : "sin_pauta";
      if (caja !== "sin_pauta") {
        const k = clave(dia, o.productId);
        ventasConPauta.set(k, (ventasConPauta.get(k) ?? 0) + 1);
        const lista = pedidosDe.get(k) ?? [];
        lista.push(o.externalId.split("/").pop() ?? o.externalId);
        pedidosDe.set(k, lista);
      }
    }

    const d = porDia.get(dia) ?? { ventas: 0, conObjetivo: 0, sumaObjetivo: 0 };
    d.ventas += 1;
    if (o.productId && caja !== "testeo") {
      const eco = economiaDe.get(dia.slice(0, 7))?.get(o.productId);
      const cpaMax = eco?.cpaMin ?? null;
      if (cpaMax != null && cpaMax > 0) {
        d.conObjetivo += 1;
        d.sumaObjetivo += cpaMax;
        const x = objetivoDe.get(o.productId) ?? {
          producto: nombreDe.get(o.productId) ?? "Producto",
          ventas: 0,
          suma: 0,
          deFicha: false,
        };
        x.ventas += 1;
        x.suma += cpaMax;
        if (!eco?.delMes) x.deFicha = true;
        objetivoDe.set(o.productId, x);
      } else {
        ventasSinObjetivo += 1;
      }
    }
    porDia.set(dia, d);

    cajas[caja] += 1;
    canales.set(o.channel, (canales.get(o.channel) ?? 0) + 1);
    if (o.recurrente) recurrentes += 1;
    if (o.conUtm) conUtm += 1;

    ventas.push({
      shopifyId: o.externalId.split("/").pop() ?? o.externalId,
      dia,
      hora,
      canal: o.channel,
      producto: o.productId ? (nombreDe.get(o.productId) ?? o.nombre ?? "—") : (o.nombre ?? "Sin líneas"),
      caja,
      recurrente: o.recurrente,
      facturado: o.netSales,
    });
  }

  // La conciliación de la caja "con pauta", producto por producto y día por
  // día: lo real contra lo que se atribuyen los píxeles. Por día, porque un
  // píxel que reporta de más el lunes no compensa uno que reporta de menos el
  // martes: son dos errores, no cero.
  const porProductoMapa = new Map<string, ConciliacionProducto>();
  let reportaMeta = 0;
  let reportaTiktok = 0;
  let sinReportar = 0;
  let deMas = 0;
  const gruposSinReportar: GrupoSinReportar[] = [];
  const claves = new Set([...ventasConPauta.keys(), ...pautaDe.keys()]);
  for (const k of claves) {
    const [diaK, productId] = k.split("|");
    const reales = ventasConPauta.get(k) ?? 0;
    const p = pautaDe.get(k);
    const meta = p?.comprasMeta ?? 0;
    const tiktok = p?.comprasTiktok ?? 0;
    const falta = Math.max(0, reales - meta - tiktok);
    const sobra = Math.max(0, meta + tiktok - reales);
    if (falta > 0) {
      gruposSinReportar.push({
        dia: diaK,
        producto: nombreDe.get(productId) ?? "Producto",
        reales,
        meta,
        tiktok,
        faltan: falta,
        pedidos: pedidosDe.get(k) ?? [],
      });
    }
    reportaMeta += meta;
    reportaTiktok += tiktok;
    sinReportar += falta;
    deMas += sobra;
    const nombre = nombreDe.get(productId) ?? "Producto";
    const f = porProductoMapa.get(productId) ?? { producto: nombre, ventas: 0, meta: 0, tiktok: 0, sinReportar: 0, deMas: 0 };
    f.ventas += reales;
    f.meta += meta;
    f.tiktok += tiktok;
    f.sinReportar += falta;
    f.deMas += sobra;
    porProductoMapa.set(productId, f);
  }

  // El gasto de cada día: todas las campañas, con producto o sin él.
  const gastoDia = new Map<string, number>();
  for (const p of pauta) gastoDia.set(iso(p.dia), (gastoDia.get(iso(p.dia)) ?? 0) + p.gasto);
  for (const s of sinProducto) gastoDia.set(iso(s.dia), (gastoDia.get(iso(s.dia)) ?? 0) + s.gasto);
  const comprasSinProducto = sinProducto.reduce((s, x) => s + x.compras, 0);

  const dias = [...new Set([...porDia.keys(), ...gastoDia.keys()])].sort().reverse();
  const cpaPorDia: CpaDelDia[] = dias.map((dia) => {
    const d = porDia.get(dia) ?? { ventas: 0, conObjetivo: 0, sumaObjetivo: 0 };
    const gasto = gastoDia.get(dia) ?? 0;
    return {
      dia,
      ventas: d.ventas,
      gasto,
      cpaReal: d.ventas > 0 ? gasto / d.ventas : null,
      cpaObjetivo: d.conObjetivo > 0 ? d.sumaObjetivo / d.conObjetivo : null,
      ventasConObjetivo: d.conObjetivo,
    };
  });
  const gastoTotal = cpaPorDia.reduce((s, d) => s + d.gasto, 0);
  const conObjetivo = [...porDia.values()].reduce((s, d) => s + d.conObjetivo, 0);
  const sumaObjetivo = [...porDia.values()].reduce((s, d) => s + d.sumaObjetivo, 0);

  const reportadas = reportaMeta + reportaTiktok + comprasSinProducto;

  return {
    brecha: {
      ventas: ordenes.length,
      reportadas,
      brecha: ordenes.length - reportadas,
      sinReportar,
      deMas,
      sinPauta: cajas.sin_pauta,
      sinIdentificar: cajas.sin_identificar,
      testeo: cajas.testeo,
      sinProducto: comprasSinProducto,
    },
    gruposSinReportar: gruposSinReportar.sort((a, b) => b.dia.localeCompare(a.dia) || b.faltan - a.faltan),
    cpaPorDia,
    gastoTotal,
    cpaReal: ordenes.length > 0 ? gastoTotal / ordenes.length : null,
    cpaObjetivo: conObjetivo > 0 ? sumaObjetivo / conObjetivo : null,
    objetivoPorProducto: [...objetivoDe.values()]
      .map((x) => ({ producto: x.producto, ventas: x.ventas, cpaMax: x.suma / x.ventas, deFicha: x.deFicha }))
      .sort((a, b) => b.ventas - a.ventas),
    ventasSinObjetivo,
    total: ordenes.length,
    cajas,
    recurrentes,
    canales: [...canales.entries()].map(([canal, n]) => ({ canal, ventas: n })).sort((a, b) => b.ventas - a.ventas),
    conPauta: cajas.meta + cajas.tiktok + cajas.ambas,
    reportaMeta,
    reportaTiktok,
    sinReportar,
    deMas,
    porProducto: [...porProductoMapa.values()]
      .filter((f) => f.ventas > 0 || f.meta + f.tiktok > 0)
      .sort((a, b) => b.ventas - a.ventas),
    ventas,
    conUtm,
  };
}

export const origenPorVenta = memorizar("origen-pedidos.origenPorVenta", origenPorVentaSinMemoria);
