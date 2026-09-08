import { db } from "@/lib/db";
import type { Range } from "@/lib/date-range";

// El puente entre lo que se pauta y lo que la tienda cobra.
//
// EL PROBLEMA
// Rentabilidad calculaba la utilidad sobre las compras que Meta y TikTok se
// atribuyen. En esta tienda eso es el 17% de las órdenes: el panel mostraba
// $7.123 facturados al lado de $339 de "ingreso estimado", y leído así parece
// que la herramienta está rota. No lo estaba —medía otra cosa— pero medir otra
// cosa al lado del número grande es indistinguible de estar equivocado.
//
// Lo que Shopify cobró SÍ está guardado, línea por línea, con el nombre del
// producto en cada una. Lo que faltaba era saber a qué producto nuestro
// pertenece cada línea, porque son dos vocabularios: en la pauta el producto se
// llama "134142 / TE GINSENG" y en la tienda "Te Ginseng para los Rinones".
//
// POR QUÉ SE PROPONE Y NO SE APLICA SOLO
// El emparejado por palabras compartidas resuelve bien el 73% de la
// facturación —"Kit Batana Oil" con "KIT DE BATANA" es obvio— pero también
// propone "Cepillo de Inodoro Desechable" para "CEPILLO 9 EN 1", que puede ser
// otro producto. Aplicar eso solo significaría meter la facturación de un
// producto dentro de otro sin que nadie se entere, y un número mal atribuido es
// peor que un número faltante: el faltante se nota.

/** Sin tildes, sin signos y en minúsculas. Es por acá por donde se cruza todo. */
export function normalizarNombre(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Palabras con las que se compara.
 *
 * Se tiran las de tres letras o menos: "de", "el", "kit", "set", "con" están en
 * media tienda y hacen que todo se parezca a todo. Sin este filtro, "Set de 3
 * Tablas" y "Set de Brochas" salían emparejados con puntaje alto.
 */
function palabras(s: string): Set<string> {
  return new Set(normalizarNombre(s).split(" ").filter((w) => w.length > 3));
}

/**
 * Qué tanto se parecen dos nombres, de 0 a 1.
 *
 * Se divide por el MENOR de los dos conjuntos y no por la unión a propósito.
 * Nuestros nombres son cortos ("TE GINSENG") y los de Shopify largos ("Te
 * Ginseng para los Rinones"): con la unión, un nombre corto contenido entero
 * dentro de uno largo daría 0,4 y se descartaría, cuando es exactamente el caso
 * que queremos encontrar.
 */
export function parecido(a: string, b: string): number {
  const A = palabras(a);
  const B = palabras(b);
  if (A.size === 0 || B.size === 0) return 0;
  let comunes = 0;
  for (const t of A) if (B.has(t)) comunes++;
  return comunes / Math.min(A.size, B.size);
}

/** Desde acá para arriba se propone. Por debajo no se muestra ni como sugerencia. */
export const UMBRAL_PROPUESTA = 0.5;

/* -------------------------------------------------------------------------- */

export type VentaPorNombre = {
  nombre: string;
  unidades: number;
  facturado: number;
  ordenes: number;
};

/** Lo que vendió la tienda en el período, agrupado por el nombre que usa Shopify. */
export async function ventasPorNombre(
  organizationId: string,
  range: Range,
): Promise<VentaPorNombre[]> {
  const filas = await db.$queryRaw<
    { nombre: string; unidades: number; facturado: number; ordenes: number }[]
  >`
    SELECT li."productName"                        AS nombre,
           coalesce(sum(li.quantity), 0)::int      AS unidades,
           coalesce(sum(li.amount), 0)::float8     AS facturado,
           count(DISTINCT li."orderId")::int       AS ordenes
    FROM "ShopifyOrderLineItem" li
    JOIN "ShopifyOrder" o ON o.id = li."orderId"
    JOIN "ShopifyStore" s ON s.id = o."storeId"
    WHERE s."organizationId" = ${organizationId}
      AND o."occurredAt" >= ${range.fromInstant}
      AND o."occurredAt" <= ${range.toInstant}
    GROUP BY li."productName"
    ORDER BY facturado DESC
  `;
  return filas.map((f) => ({
    nombre: f.nombre,
    unidades: Number(f.unidades) || 0,
    facturado: Number(f.facturado) || 0,
    ordenes: Number(f.ordenes) || 0,
  }));
}

export type VentaRealDeProducto = {
  /** Unidades PEDIDAS, no entregadas: la efectividad se aplica después. */
  unidades: number;
  /** Lo que se facturó en la tienda por esas unidades. */
  facturado: number;
  ordenes: number;
  /** Con qué nombres de Shopify entró esta venta. */
  nombres: string[];
};

/**
 * Lo vendido de verdad, por producto nuestro.
 *
 * La agrupación por nombre se hace en la base —son un par de cientos de
 * filas— y el cruce contra los enlaces se hace acá, en memoria. Podría hacerse
 * todo en SQL, pero entonces la normalización de los nombres viviría dos veces
 * —una en JavaScript al guardar y otra en SQL al leer— y el día que cambie una
 * de las dos, los números empezarían a no cuadrar sin ningún error a la vista.
 */
export async function ventasRealesPorProducto(
  organizationId: string,
  range: Range,
): Promise<Map<string, VentaRealDeProducto>> {
  const [ventas, enlaces] = await Promise.all([
    ventasPorNombre(organizationId, range),
    db.productoShopify.findMany({
      where: { organizationId },
      select: { productId: true, nombreNorm: true },
    }),
  ]);

  const productoDe = new Map(enlaces.map((e) => [e.nombreNorm, e.productId]));
  const porProducto = new Map<string, VentaRealDeProducto>();

  for (const v of ventas) {
    const productId = productoDe.get(normalizarNombre(v.nombre));
    if (!productId) continue;
    const actual = porProducto.get(productId) ?? {
      unidades: 0,
      facturado: 0,
      ordenes: 0,
      nombres: [],
    };
    actual.unidades += v.unidades;
    actual.facturado += v.facturado;
    // Las órdenes se suman y por eso pueden contar de más: un pedido con dos
    // nombres del mismo producto —el suelto y el pack— cuenta dos veces. Se
    // acepta porque el dato que se usa para decidir son las unidades y la
    // plata; las órdenes son referencia.
    actual.ordenes += v.ordenes;
    actual.nombres.push(v.nombre);
    porProducto.set(productId, actual);
  }

  return porProducto;
}

/* -------------------------------------------------------------------------- */

export type Propuesta = {
  /** El nombre de Shopify que todavía no cuelga de ningún producto. */
  nombre: string;
  unidades: number;
  facturado: number;
  /** El producto que más se le parece, si alguno pasa el umbral. */
  sugerido: { id: string; code: string; name: string; puntaje: number } | null;
};

export type Cobertura = {
  facturadoTotal: number;
  facturadoEnlazado: number;
  /** 0 a 1. Cuánto de lo que cobró la tienda ya sabemos de qué producto es. */
  parte: number;
  nombresEnlazados: number;
  nombresSueltos: number;
};

/**
 * Qué falta por enlazar, con la mejor sugerencia para cada cosa.
 *
 * Ordenado por facturación: enlazar el nombre que movió cincuenta mil dólares
 * cambia el resultado, y enlazar el que movió doce no.
 */
export async function proponerEnlaces(
  organizationId: string,
  range: Range,
): Promise<{ propuestas: Propuesta[]; cobertura: Cobertura }> {
  const [ventas, enlaces, productos] = await Promise.all([
    ventasPorNombre(organizationId, range),
    db.productoShopify.findMany({ where: { organizationId }, select: { nombreNorm: true } }),
    db.product.findMany({
      where: { organizationId, archived: false },
      select: { id: true, code: true, name: true },
    }),
  ]);

  const yaEnlazados = new Set(enlaces.map((e) => e.nombreNorm));

  let facturadoTotal = 0;
  let facturadoEnlazado = 0;
  let nombresEnlazados = 0;
  const propuestas: Propuesta[] = [];

  for (const v of ventas) {
    facturadoTotal += v.facturado;
    if (yaEnlazados.has(normalizarNombre(v.nombre))) {
      facturadoEnlazado += v.facturado;
      nombresEnlazados++;
      continue;
    }

    let mejor: Propuesta["sugerido"] = null;
    for (const p of productos) {
      const puntaje = parecido(v.nombre, p.name);
      if (puntaje >= UMBRAL_PROPUESTA && (mejor == null || puntaje > mejor.puntaje)) {
        mejor = { id: p.id, code: p.code, name: p.name, puntaje };
      }
    }

    propuestas.push({
      nombre: v.nombre,
      unidades: v.unidades,
      facturado: v.facturado,
      sugerido: mejor,
    });
  }

  return {
    propuestas,
    cobertura: {
      facturadoTotal,
      facturadoEnlazado,
      parte: facturadoTotal > 0 ? facturadoEnlazado / facturadoTotal : 0,
      nombresEnlazados,
      nombresSueltos: propuestas.length,
    },
  };
}
