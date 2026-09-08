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
 * Palabras vacías: las que están en media tienda y no distinguen nada.
 *
 * Es una lista y no un filtro por largo. El primer intento tiraba todo lo de
 * tres letras o menos, y con eso "Kit Batana Oil" perdía "kit" y "oil", se
 * quedaba solo con "batana", y empataba a puntaje perfecto con SHAMPOO DE
 * BATANA, KIT DE BATANA y BATANA a la vez. El desempate lo terminaba decidiendo
 * el orden en que la base devolvía los productos, que es como no decidirlo: en
 * producción propuso el shampoo para el kit.
 */
const VACIAS = new Set([
  "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas",
  "para", "por", "con", "sin", "que", "the", "and", "mas",
]);

function palabras(s: string): Set<string> {
  return new Set(
    normalizarNombre(s)
      .split(" ")
      .filter((w) => w.length >= 3 && !VACIAS.has(w)),
  );
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
  return comparar(a, b).base;
}

/**
 * Los dos puntajes que hacen falta para elegir bien.
 *
 * "base" es la contención: cuántas palabras del nombre más corto están en el
 * otro. Es la que encuentra al candidato, y por eso divide por el menor de los
 * dos conjuntos.
 *
 * "solape" es la simétrica —común sobre unión— y solo sirve para desempatar,
 * porque castiga al candidato que trae palabras de más. Entre KIT DE BATANA y
 * BATANA a secas para "Kit Batana Oil", los dos contienen todo lo que pueden y
 * empatan en base; el que además comparte "kit" gana en solape.
 */
export function comparar(a: string, b: string): { base: number; solape: number } {
  const A = palabras(a);
  const B = palabras(b);
  if (A.size === 0 || B.size === 0) return { base: 0, solape: 0 };
  let comunes = 0;
  for (const t of A) if (B.has(t)) comunes++;
  const union = A.size + B.size - comunes;
  return {
    base: comunes / Math.min(A.size, B.size),
    solape: union > 0 ? comunes / union : 0,
  };
}

/**
 * Cuánto tiene que separarse el ganador del segundo para fiarse de él.
 *
 * Debajo de esto la sugerencia se marca como dudosa y queda fuera del botón
 * que acepta en bloque. "Ampolla Deep Collagen" tiene enfrente DEEP COLLAGEN
 * AMPOULE y SUNGBOON DEEP COLLAGEN con exactamente el mismo puntaje: elegir por
 * nosotros ahí es tirar una moneda con la facturación de dos productos.
 */
const MARGEN_DESEMPATE = 0.15;

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
  /**
   * Hay otro producto que puntúa casi igual.
   *
   * La sugerencia se muestra igual —sigue siendo la mejor— pero avisada y fuera
   * del botón que acepta en bloque: en un empate, aceptar sin mirar es meter la
   * facturación de un producto dentro de otro.
   */
  dudosa: boolean;
  /** Con qué otro producto empata, para poder decidir sin salir de la fila. */
  rival: { code: string; name: string } | null;
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

    // Se puntúan todos y se ordena, en vez de ir quedándose con el mejor sobre
    // la marcha: para saber si la elección es confiable hay que poder mirar al
    // segundo, y con un solo acumulador el segundo ya se perdió.
    const candidatos = productos
      .map((p) => ({ p, ...comparar(v.nombre, p.name) }))
      .filter((c) => c.base >= UMBRAL_PROPUESTA)
      .sort((a, b) => b.base - a.base || b.solape - a.solape);

    const ganador = candidatos[0] ?? null;
    const segundo = candidatos[1] ?? null;
    const dudosa =
      ganador != null &&
      segundo != null &&
      segundo.base >= ganador.base &&
      ganador.solape - segundo.solape < MARGEN_DESEMPATE;

    propuestas.push({
      nombre: v.nombre,
      unidades: v.unidades,
      facturado: v.facturado,
      sugerido:
        ganador == null
          ? null
          : { id: ganador.p.id, code: ganador.p.code, name: ganador.p.name, puntaje: ganador.base },
      dudosa,
      rival: dudosa && segundo ? { code: segundo.p.code, name: segundo.p.name } : null,
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
