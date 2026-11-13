// Lo que responde la burbuja de ayuda sin gastar nada.
//
// La capacitación sale sola una sola vez (Sebastian, 12-nov). Lo que alguien
// no entendió lo pregunta después en la burbuja, en sus palabras: «¿cómo le
// pongo testeo a un producto?». Esto busca la respuesta en lo que ya está
// escrito —las preguntas frecuentes y los pasos de la capacitación— y la
// devuelve con el paso al que pertenece, que es el que tiene el video y la
// pantalla a la que hay que ir.
//
// Es una búsqueda por palabras y no una IA a propósito: responde al instante,
// no cuesta por pregunta y nunca inventa una función que no existe. Si no
// encuentra nada, la burbuja ofrece preguntarle a Jarvis.
//
// Puro, sin React ni base: se prueba solo en tests/ayuda-busqueda.test.ts.

export type PreguntaFrecuente = {
  id: string;
  pregunta: string;
  respuesta: string;
  /** El paso de la capacitación que la explica: de ahí salen el video y la pantalla. */
  pasoId: string;
  /** Palabras que la gente usa y que no aparecen en el texto. */
  sinonimos?: string[];
};

export type PasoBuscable = {
  id: string;
  ruta: string;
  seccion: string;
  titulo: string;
  texto: string;
  puntos: string[];
};

export type Resultado =
  | { tipo: "pregunta"; puntaje: number; pregunta: PreguntaFrecuente; paso: PasoBuscable | null }
  | { tipo: "paso"; puntaje: number; paso: PasoBuscable; frase: string };

// Palabras que no dicen nada de qué se busca. Sin sacarlas, «cómo se hace
// para…» empata con media capacitación.
const VACIAS = new Set(
  (
    "a al algo algun alguna como con cual cuales cuando de del donde el ella ellos en entre es esa ese eso esta este esto hace hacer hago hay la las le lo los mas me mi mis no o para pero por porque puedo que se si sin son su sus te tengo tiene un una uno y ya yo qué cómo dónde cuál puede pueden quiero necesito sale salen veo ver"
  ).split(" "),
);

/** Minúsculas, sin tildes, sin signos. «¿Cómo?» y «como» son lo mismo. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Las palabras con contenido, recortadas a su raíz corta.
 *
 * Cinco letras alcanzan para que «etiqueta», «etiquetas» y «etiquetar» sean
 * la misma, y «confirmación», «confirman» y «confirmar» también, sin meter un
 * lematizador para algo tan chico.
 */
export function palabras(texto: string): string[] {
  return normalizar(texto)
    .split(" ")
    .filter((p) => p.length > 2 && !VACIAS.has(p))
    .map((p) => p.slice(0, 5));
}

function coincidencias(buscadas: string[], texto: string): number {
  if (!buscadas.length) return 0;
  const propias = new Set(palabras(texto));
  return buscadas.reduce((n, p) => n + (propias.has(p) ? 1 : 0), 0);
}

/**
 * Las mejores respuestas para una duda, de la más a la menos parecida.
 *
 * Una pregunta frecuente pesa más que un paso: está escrita para responder
 * justo eso. Dentro de un paso, se devuelve la frase que más se parece a lo
 * buscado, para que la respuesta sea una oración y no un párrafo entero.
 */
export function buscarAyuda(
  consulta: string,
  preguntas: PreguntaFrecuente[],
  pasos: PasoBuscable[],
  cuantos = 3,
): Resultado[] {
  const buscadas = [...new Set(palabras(consulta))];
  if (!buscadas.length) return [];
  const porId = new Map(pasos.map((p) => [p.id, p]));
  const resultados: Resultado[] = [];

  for (const q of preguntas) {
    // Solo las preguntas cuyo paso puede ver esta persona.
    const paso = porId.get(q.pasoId) ?? null;
    if (!paso) continue;
    const puntaje =
      coincidencias(buscadas, `${q.pregunta} ${(q.sinonimos ?? []).join(" ")}`) * 3 +
      coincidencias(buscadas, q.respuesta);
    if (puntaje > 0) resultados.push({ tipo: "pregunta", puntaje: puntaje + 1, pregunta: q, paso });
  }

  for (const paso of pasos) {
    const titulo = coincidencias(buscadas, `${paso.seccion} ${paso.titulo}`) * 2;
    let mejor = { frase: paso.texto, n: coincidencias(buscadas, paso.texto) };
    for (const punto of paso.puntos) {
      const n = coincidencias(buscadas, punto);
      if (n > mejor.n) mejor = { frase: punto, n };
    }
    const puntaje = titulo + mejor.n;
    if (puntaje > 0) resultados.push({ tipo: "paso", puntaje, paso, frase: mejor.frase });
  }

  // Exigir al menos la mitad de las palabras evita que una sola palabra común
  // («producto») traiga cualquier cosa. Con una o dos palabras basta una.
  const minimo = Math.max(1, Math.ceil(buscadas.length / 2));
  return resultados
    .filter((r) => r.puntaje >= minimo)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, cuantos);
}

/**
 * Los pasos que explican la pantalla en la que se está.
 *
 * La ruta de un paso puede traer `?vista=…`: Control publicitario tiene
 * varias pestañas en la misma dirección. Se muestran solo los de la pestaña
 * abierta; sin pestaña propia, los generales de la dirección (sin `?vista`),
 * y si tampoco hay, todos los de la dirección.
 */
export function pasosDeLaPantalla<T extends { ruta: string }>(
  pasos: T[],
  pathname: string,
  vista: string | null,
): T[] {
  const deLaRuta = pasos.filter((p) => p.ruta.split("?")[0] === pathname);
  const vistaDe = (p: T) => new URLSearchParams(p.ruta.split("?")[1] ?? "").get("vista");
  const exactos = deLaRuta.filter((p) => vistaDe(p) === vista);
  if (exactos.length) return exactos;
  const generales = deLaRuta.filter((p) => vistaDe(p) == null);
  return generales.length ? generales : deLaRuta;
}
