// Cómo se sabe a qué producto pertenece una campaña.
//
// Se investigó el camino "oficial" primero y no existe: las órdenes de Shopify
// vienen con landingPageUrl, referrerUrl y customerJourneySummary en null
// (Funnelish y Releasit las crean por API, sin navegación), y el link_url de
// Windsor volvió vacío en los 150+ anuncios que se probaron. No hay un link
// que cruzar.
//
// Lo que sí existe es la convención que el equipo ya usa en cada campaña:
//
//   134142 / TE GINSENG / ABO / TEST / 05-06-2026
//   ^^^^^^   ^^^^^^^^^^
//   código   producto
//
// El separador es "/" y el primer segmento es un número interno que se repite
// en todas las campañas del mismo producto, en Meta y en TikTok. Es más
// confiable que el nombre: "114962/345/..." y "114962 / CREMA 345 /..." son el
// mismo producto escrito distinto, y el código los une igual.
//
// Cubre el 89,9% de las campañas y el 96,6% del gasto.

export type CampaignRef = { code: string; name: string };

/** Saca código y nombre de producto del nombre de una campaña. */
export function parseCampaignRef(campaignName: string): CampaignRef | null {
  const parts = campaignName
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  const code = parts[0];
  if (!/^\d{3,8}$/.test(code)) return null;

  const name = limpiarNombre(parts[1]);
  if (name.length < 2) return null;

  return { code, name };
}

// "ARENCIA MOCHI TESTEO" -> "ARENCIA MOCHI". Las campañas a veces arrastran la
// etapa en el mismo segmento del producto; no es parte del nombre.
const COLAS = /\s+(TESTEO|TEST|ESCALADO|ESC)$/;

function limpiarNombre(raw: string) {
  let n = raw.replace(/\s+/g, " ").trim().toUpperCase();
  while (COLAS.test(n)) n = n.replace(COLAS, "");
  return n.trim();
}

/** Quita acentos y puntuación para poder comparar contra el catálogo. */
export function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Elige, entre los nombres con que aparece un mismo código, cuál usar.
 * Gana el más repetido; si empatan, el más descriptivo (el más largo), porque
 * entre "345" y "CREMA 345" el segundo dice algo.
 */
export function nombreCanonico(nombres: string[]) {
  const cuenta = new Map<string, number>();
  for (const n of nombres) cuenta.set(n, (cuenta.get(n) ?? 0) + 1);
  return [...cuenta.entries()].sort(
    (a, b) => b[1] - a[1] || b[0].length - a[0].length
  )[0][0];
}

/**
 * Busca el producto del catálogo de Shopify que corresponde a un nombre de
 * campaña, para traerle precio y costo reales.
 *
 * Se acepta que uno contenga al otro: la campaña dice "TE GINSENG" y Shopify
 * "Té Ginseng Rojo 30 Sobres". Entre varios candidatos gana el título más
 * corto, que es el menos específico de más y por lo tanto el más probable.
 */
export function buscarEnCatalogo<T extends { title: string }>(
  nombreProducto: string,
  catalogo: T[]
): T | null {
  const objetivo = normalizar(nombreProducto);
  if (objetivo.length < 3) return null;

  const candidatos = catalogo.filter((p) => {
    const titulo = normalizar(p.title);
    return titulo.includes(objetivo) || objetivo.includes(titulo);
  });
  if (candidatos.length === 0) return null;

  return candidatos.sort((a, b) => a.title.length - b.title.length)[0];
}
