import { db } from "@/lib/db";
import { memorizar } from "@/lib/memoria";
import { normalizar } from "@/lib/product-code";
import type { Range } from "@/lib/date-range";

// De dónde viene cada venta, orden por orden.
//
// EL PROBLEMA QUE RESUELVE
// El panel sabía decir "hoy entraron 224 órdenes y la pauta explica 198": las
// otras 26 quedaban como "sin explicación", y ahí terminaba la conversación.
// Con el recorrido del cliente que guarda Shopify (ver fetchOrderAttribution)
// se puede contestar la pregunta de verdad: si vinieron de otra cuenta
// publicitaria, de un link que alguien pasó por WhatsApp, de una búsqueda en
// Google o de un cliente que ya conocía la tienda.
//
// CÓMO SE CLASIFICA
// Se mira, en este orden: los parámetros UTM del enlace, el sitio que refirió
// la visita, y lo que Shopify llama "source". La primera pista que reconoce
// gana. Si no hay ninguna, es tráfico directo: alguien que escribió la
// dirección o abrió un link que le pasaron.
//
// LO QUE NO SE PUEDE SABER
// Shopify guarda el recorrido solo si el visitante aceptó las cookies y si la
// visita quedó registrada. Las órdenes sin recorrido aparecen como "sin dato",
// y eso se dice en pantalla en vez de repartirlas a ojo.

export type CategoriaOrigen =
  | "Meta"
  | "TikTok"
  | "Google"
  | "WhatsApp"
  | "Otra red social"
  | "Correo"
  | "Directo o link compartido"
  | "Otra fuente"
  | "Sin dato";

export type OrdenConOrigen = {
  externalId: string;
  momento: Date;
  monto: number;
  canal: string;
  producto: string | null;
  categoria: CategoriaOrigen;
  /** El detalle crudo: utm, referente o lo que haya. Para poder auditarlo. */
  pista: string | null;
  campana: string | null;
  /** La campaña del enlace no existe en Jarvis: huele a otra cuenta publicitaria. */
  campanaDesconocida: boolean;
  /** El teléfono ya había comprado antes de este período. */
  recompra: boolean;
};

export type ResumenOrigen = {
  categoria: CategoriaOrigen;
  ordenes: number;
  monto: number;
};

export type ReporteOrigen = {
  desde: string;
  hasta: string;
  ordenes: number;
  monto: number;
  /** Cuántas órdenes tienen recorrido guardado. */
  conDato: number;
  porCategoria: ResumenOrigen[];
  /** Las que la pauta de Meta/TikTok no explica, que son las que se preguntan. */
  sinPauta: OrdenConOrigen[];
  /** Campañas que aparecen en los enlaces y no existen en Jarvis. */
  campanasDesconocidas: { campana: string; ordenes: number; monto: number }[];
  recompras: number;
};

const REGLAS: { categoria: CategoriaOrigen; patron: RegExp }[] = [
  { categoria: "Meta", patron: /facebook|fb|instagram|\big\b|meta|messenger/i },
  { categoria: "TikTok", patron: /tiktok|tik_tok|\btt\b|bytedance/i },
  { categoria: "WhatsApp", patron: /whatsapp|wa\.me|api\.whatsapp/i },
  { categoria: "Google", patron: /google|youtube|gclid|adwords|gads/i },
  { categoria: "Otra red social", patron: /kwai|snapchat|pinterest|twitter|x\.com|telegram|linkedin/i },
  { categoria: "Correo", patron: /email|correo|mailchimp|klaviyo|newsletter/i },
];

const DIRECTO = /^(direct|unknown|none|null)$/i;

/** La categoría de una orden a partir de lo que dejó su recorrido. */
export function clasificarOrigen(o: {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrerUrl: string | null;
  origenFuente: string | null;
  origenTipo: string | null;
  atribucionAl: Date | null;
}): { categoria: CategoriaOrigen; pista: string | null } {
  const pistas = [o.utmSource, o.utmMedium, o.utmCampaign, o.referrerUrl, o.origenFuente, o.origenTipo].filter(
    (x): x is string => Boolean(x && x.trim()),
  );

  for (const { categoria, patron } of REGLAS) {
    const encontrada = pistas.find((p) => patron.test(p));
    if (encontrada) return { categoria, pista: encontrada };
  }

  // Sin recorrido guardado: no es lo mismo que "vino directo".
  if (!o.atribucionAl) return { categoria: "Sin dato", pista: null };
  if (pistas.length === 0 || pistas.every((p) => DIRECTO.test(p))) {
    return { categoria: "Directo o link compartido", pista: o.origenFuente ?? null };
  }
  return { categoria: "Otra fuente", pista: pistas[0] };
}

const SIN_PAUTA: CategoriaOrigen[] = [
  "Google",
  "WhatsApp",
  "Otra red social",
  "Correo",
  "Directo o link compartido",
  "Otra fuente",
  "Sin dato",
];

async function reporteDeOrigenSinMemoria(organizationId: string, range: Range): Promise<ReporteOrigen> {
  const [ordenes, campanas] = await Promise.all([
    db.$queryRaw<
      {
        externalId: string;
        occurredAt: Date;
        netSales: number;
        channel: string;
        producto: string | null;
        utmSource: string | null;
        utmMedium: string | null;
        utmCampaign: string | null;
        referrerUrl: string | null;
        origenFuente: string | null;
        origenTipo: string | null;
        atribucionAl: Date | null;
        telefono: string | null;
        anteriores: number;
      }[]
    >`
      SELECT o."externalId", o."occurredAt", o."netSales"::float8 AS "netSales", o.channel,
             o."utmSource", o."utmMedium", o."utmCampaign", o."referrerUrl",
             o."origenFuente", o."origenTipo", o."atribucionAl",
             o."clienteTelefono" AS telefono,
             (SELECT count(*)::int FROM "ShopifyOrder" p
               WHERE p."storeId" = o."storeId"
                 AND p."clienteTelefono" IS NOT NULL
                 AND p."clienteTelefono" = o."clienteTelefono"
                 AND p."occurredAt" < ${range.fromInstant}) AS anteriores,
             (SELECT li."productName" FROM "ShopifyOrderLineItem" li
               WHERE li."orderId" = o.id ORDER BY li.amount DESC LIMIT 1) AS producto
        FROM "ShopifyOrder" o
        JOIN "ShopifyStore" s ON s.id = o."storeId"
       WHERE s."organizationId" = ${organizationId}
         AND o."occurredAt" >= ${range.fromInstant} AND o."occurredAt" <= ${range.toInstant}
       ORDER BY o."occurredAt" DESC`,
    db.campaign.findMany({ where: { adAccount: { organizationId } }, select: { name: true } }),
  ]);

  const nombresCampana = new Set(campanas.map((c) => normalizar(c.name)));

  const filas: OrdenConOrigen[] = ordenes.map((o) => {
    const { categoria, pista } = clasificarOrigen(o);
    const campana = o.utmCampaign?.trim() || null;
    return {
      externalId: o.externalId,
      momento: o.occurredAt,
      monto: o.netSales,
      canal: o.channel,
      producto: o.producto,
      categoria,
      pista,
      campana,
      // Una campaña en el enlace que Jarvis no conoce solo tiene dos
      // explicaciones: una cuenta publicitaria que no está conectada, o un
      // enlace armado a mano.
      campanaDesconocida: Boolean(campana) && !nombresCampana.has(normalizar(campana!)),
      recompra: o.anteriores > 0,
    };
  });

  const porCategoria = new Map<CategoriaOrigen, ResumenOrigen>();
  for (const f of filas) {
    const r = porCategoria.get(f.categoria) ?? { categoria: f.categoria, ordenes: 0, monto: 0 };
    r.ordenes += 1;
    r.monto += f.monto;
    porCategoria.set(f.categoria, r);
  }

  const desconocidas = new Map<string, { campana: string; ordenes: number; monto: number }>();
  for (const f of filas) {
    if (!f.campanaDesconocida || !f.campana) continue;
    const d = desconocidas.get(f.campana) ?? { campana: f.campana, ordenes: 0, monto: 0 };
    d.ordenes += 1;
    d.monto += f.monto;
    desconocidas.set(f.campana, d);
  }

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    desde: iso(range.from),
    hasta: iso(range.to),
    ordenes: filas.length,
    monto: filas.reduce((s, f) => s + f.monto, 0),
    conDato: filas.filter((f) => f.categoria !== "Sin dato").length,
    porCategoria: [...porCategoria.values()].sort((a, b) => b.ordenes - a.ordenes),
    sinPauta: filas.filter((f) => SIN_PAUTA.includes(f.categoria)),
    campanasDesconocidas: [...desconocidas.values()].sort((a, b) => b.ordenes - a.ordenes),
    recompras: filas.filter((f) => f.recompra).length,
  };
}

export const reporteDeOrigen = memorizar("origen-ventas.reporteDeOrigen", reporteDeOrigenSinMemoria);
