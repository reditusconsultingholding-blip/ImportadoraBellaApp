import { ANGLES, VISUAL_FORMATS } from "@/lib/pipeline-options";

// Qué ángulo y qué formato tiene un anuncio, leyéndolo de su nombre.
//
// QUÉ SE PIDIÓ
// Fabricio: "necesito que en la sección de productos, al lado de anuncios y al
// lado de campaña, aparezca una categoría, y esa categoría la vas a determinar
// de acuerdo al nombre de la campaña". El equipo ya escribe el ángulo ahí
// —"ad set 1 · ángulo cansancio"— y el conjunto de anuncios es donde lo ponen:
// "nosotros manejamos los ángulos a nivel de conjunto de anuncios".
//
// CÓMO SE DECIDE, Y POR QUÉ ASÍ
// Se busca en el nombre del anuncio, en el del conjunto y en el de la campaña
// —en ese orden, de lo más específico a lo más general— alguna de las palabras
// que el equipo ya usa en Super Ads: los 30 ángulos y los 16 formatos de
// `pipeline-options.ts`, más los sinónimos que aparecen escritos a mano.
//
// NO se adivina. Un nombre que no dice nada devuelve null y en pantalla sale
// "sin clasificar", que es información: significa que esa campaña se subió sin
// nomenclatura y que no se va a poder comparar con las demás. Inventarle un
// ángulo sería peor que dejarlo vacío — el objetivo de todo esto es saber qué
// ángulo funciona, y un ángulo inventado contamina esa respuesta.
//
// Esto es la mitad del trabajo, y conviene decirlo: lee lo que YA está
// escrito. Que todas las campañas nuevas traigan el ángulo en el nombre es la
// otra mitad, y es del equipo.

const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Cómo se escribe de verdad cada ángulo en los nombres de campaña.
 *
 * La lista de Super Ads tiene los nombres "de manual" —"Frustración
 * acumulada"— pero en el administrador de anuncios nadie escribe eso: escribe
 * "cansancio", "dolor", "antes y despues". Acá se anotan esas formas, que son
 * las que hay que reconocer.
 */
const PISTAS_ANGULO: Record<string, string[]> = {
  "Frustración acumulada": ["frustracion", "cansancio", "cansada", "harta", "ya probaste"],
  "Dolor hiperespecífico": ["dolor", "molestia", "punzada", "ardor"],
  "Vergüenza social": ["verguenza", "pena", "que diran", "incomoda"],
  "Miedo a empeorar": ["miedo", "empeorar", "a tiempo", "no esperes"],
  "Resultados con métricas": ["resultados", "metricas", "dias", "semanas", "porcentaje"],
  "Transformación emocional": ["transformacion", "cambio", "volver a sentirte"],
  "Resultado rápido": ["rapido", "express", "inmediato", "en minutos"],
  "Resultado lifestyle": ["lifestyle", "estilo de vida", "rutina"],
  "Testimonial real": ["testimonio", "testimonial", "cliente real", "ugc"],
  "Número de clientes": ["clientes", "personas ya", "mas de"],
  "Vs. alternativas": ["vs", "versus", "comparacion", "alternativa"],
  "Review screenshot": ["review", "reseña", "captura", "screenshot"],
  "Ingredientes / Mecanismo": ["ingredientes", "mecanismo", "formula", "como funciona"],
  "Comparación lógica": ["logica", "comparativa"],
  "Dato sorprendente": ["dato", "sabias que", "sorprendente"],
  Desmitificación: ["mito", "desmitificacion", "mentira"],
  "Identidad deseada": ["identidad", "quien quieres ser"],
  "Pertenencia / Tribu": ["tribu", "pertenencia", "comunidad"],
  Merecimiento: ["mereces", "merecimiento", "date el gusto"],
  "Orgullo local / COD": ["ecuador", "nacional", "contraentrega", "cod", "pago al recibir"],
  "Objeción de precio": ["precio", "barato", "caro", "oferta", "descuento", "promo"],
  "Objeción funciona": ["funciona", "sirve", "resultados reales"],
  "Objeción seguridad": ["seguro", "natural", "sin efectos", "aprobado"],
  "Objeción tiempo": ["tiempo", "cuanto tarda", "en cuanto"],
  "Pregunta directa": ["pregunta", "te pasa", "sufres"],
  "Pattern interrupt": ["pattern", "interrupt", "hook raro"],
  "Micro historia": ["historia", "story", "storytelling"],
  Unboxing: ["unboxing", "desempaque"],
  Beneficios: ["beneficios", "para que sirve"],
  "Modo de uso": ["modo de uso", "como se usa", "tutorial"],
};

/** Y lo mismo para el formato, que el equipo pone a nivel de anuncio. */
const PISTAS_FORMATO: Record<string, string[]> = {
  "Antes / Después": ["antes y despues", "antes despues", "before after", "ad"],
  "UGC con persona": ["ugc", "creadora", "creador"],
  "Talking head sin cortes": ["talking head", "talking", "hablando"],
  "Ugly ad / One take": ["ugly", "one take", "onetake"],
  "VSL corta": ["vsl"],
  "Long form video": ["long form", "largo"],
  "Demo sin persona": ["demo", "producto solo"],
  "Testimonio real en video": ["testimonio video", "testimonio real"],
  "Respuesta a comentario": ["respuesta a comentario", "comentario"],
  "Grid ad / Estático": ["grid", "estatico", "static"],
  "UGC estático": ["ugc estatico"],
  "Testimonial screenshot": ["screenshot", "captura de chat"],
  "Founder / Texto carrusel": ["founder", "carrusel"],
  Frankenstein: ["frankenstein", "franken"],
  "Problema / Solución": ["problema solucion", "problema", "solucion"],
  Beneficios: ["beneficios"],
};

/** Busca la primera etiqueta cuyo nombre o alguna de sus pistas esté en el texto. */
function buscar(texto: string, lista: readonly string[], pistas: Record<string, string[]>) {
  const t = ` ${plano(texto)} `;
  // El nombre de manual primero: si alguien escribió "Antes / Después" tal
  // cual, gana sobre cualquier pista suelta.
  for (const etiqueta of lista) {
    if (t.includes(` ${plano(etiqueta)} `)) return etiqueta;
  }
  // Las pistas se prueban de la más larga a la más corta: "antes y despues"
  // antes que "ad", que si no se comería medio catálogo.
  const porLargo = Object.entries(pistas)
    .flatMap(([etiqueta, ps]) => ps.map((p) => ({ etiqueta, p: plano(p) })))
    .sort((a, b) => b.p.length - a.p.length);
  for (const { etiqueta, p } of porLargo) {
    if (p.length >= 3 && t.includes(` ${p} `)) return etiqueta;
  }
  return null;
}

export type CategoriaAnuncio = {
  /** El ángulo de venta, del conjunto de anuncios o de la campaña. */
  angulo: string | null;
  /** El formato o concepto creativo, del nombre del anuncio. */
  formato: string | null;
  /** De dónde salió el ángulo, para poder explicarlo en pantalla. */
  desde: "anuncio" | "conjunto" | "campana" | null;
};

/**
 * Clasifica un anuncio por sus tres nombres.
 *
 * `angulosPropios` son los del producto —"sin olor a batana"— que no están en
 * la lista general: se prueban primero porque son más específicos y porque el
 * equipo los escribió justamente para este producto.
 */
export function categoriaDeAnuncio(
  nombres: { anuncio?: string | null; conjunto?: string | null; campana?: string | null },
  angulosPropios: string[] = [],
): CategoriaAnuncio {
  const propios = angulosPropios.filter(Boolean);

  const niveles: { texto: string; desde: CategoriaAnuncio["desde"] }[] = [
    { texto: nombres.conjunto ?? "", desde: "conjunto" },
    { texto: nombres.anuncio ?? "", desde: "anuncio" },
    { texto: nombres.campana ?? "", desde: "campana" },
  ];

  let angulo: string | null = null;
  let desde: CategoriaAnuncio["desde"] = null;
  for (const n of niveles) {
    if (!n.texto) continue;
    const propio = buscar(n.texto, propios, {});
    const general = propio ?? buscar(n.texto, ANGLES, PISTAS_ANGULO);
    if (general) {
      angulo = general;
      desde = n.desde;
      break;
    }
  }

  // El formato sale del nombre del anuncio, que es donde el equipo lo pone.
  const formato = nombres.anuncio ? buscar(nombres.anuncio, VISUAL_FORMATS, PISTAS_FORMATO) : null;

  return { angulo, formato, desde };
}
