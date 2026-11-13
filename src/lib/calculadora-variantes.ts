// Un producto, una sola línea en el selector de la Calculadora.
//
// En Shopify cada oferta es un producto aparte: «Combo 1 Cyperus + 1
// Razuradora», «Combo 2 Cyperus + 1 Razuradora», «Combo 3 Cyperus+ 1
// Razuradora». El selector mostraba los tres, y además las copias con
// « - Product Id: 176360» que deja Dropi. El cliente (nota de voz, 13-nov):
// «hay full productos repetidos… que solamente aparezca un solo producto».
//
// Acá se agrupan los nombres que solo cambian en la cantidad de la oferta y se
// deja uno: el que tiene ficha propia, si no el que se está pautando, y si no
// la oferta más chica. Los demás quedan anotados en `variantes` para decir
// cuántas ofertas hay detrás.
//
// Puro, sin React: se prueba en tests/calculadora-variantes.test.ts.

/** «Combo 1 Cyperus», «Pack 3 …», «2 Shampoo + 1 Aceite…»: nombres de oferta. */
const ES_OFERTA = /^(combo|pack|kit)\b|^\d|\+/;

/**
 * La clave que comparten las ofertas de un mismo producto.
 *
 * Solo se quitan números de una o dos cifras sueltos (las cantidades de la
 * oferta) y solo en nombres de oferta. «Shampoo 100ml» y «Shampoo 300ml», o
 * «Hair Growth x 80 cápsulas» y «x 120», siguen siendo productos distintos.
 */
export function claveDeVariante(nombre: string): string {
  let t = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s*-\s*product id:\s*\d+\s*$/, "")
    .trim();
  if (ES_OFERTA.test(t)) t = t.replace(/(^|[\s+:])\d{1,2}(?=[\s+]|$)/g, "$1");
  return t
    .replace(/[^a-z0-9ñ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Agrupable = {
  name: string;
  activo?: boolean;
  cpa: number | null;
  efectividad: number | null;
  flete: number | null;
  variantes?: string[];
};

/** Cuál de las ofertas queda a la vista: la que más sabe del producto. */
function peso(p: Agrupable): number {
  const tieneFicha = p.cpa != null || p.efectividad != null || p.flete != null;
  return (tieneFicha ? 4 : 0) + (p.activo ? 2 : 0);
}

/** Los números del nombre, para preferir la oferta más chica: «Combo 1» antes que «Combo 3». */
function cantidad(nombre: string): number {
  return (nombre.replace(/\s*-\s*product id:\s*\d+\s*$/i, "").match(/\d+/g) ?? []).reduce((s, n) => s + Number(n), 0);
}

export function agruparVariantes<T extends Agrupable>(lista: T[]): (T & { variantes?: string[] })[] {
  const grupos = new Map<string, T[]>();
  for (const p of lista) {
    const k = claveDeVariante(p.name) || p.name;
    const g = grupos.get(k);
    if (g) g.push(p);
    else grupos.set(k, [p]);
  }
  const salida: (T & { variantes?: string[] })[] = [];
  for (const g of grupos.values()) {
    if (g.length === 1) {
      salida.push(g[0]);
      continue;
    }
    const orden = [...g].sort(
      (a, b) =>
        peso(b) - peso(a) ||
        cantidad(a.name) - cantidad(b.name) ||
        a.name.length - b.name.length ||
        a.name.localeCompare(b.name, "es"),
    );
    const [elegido, ...resto] = orden;
    salida.push({
      ...elegido,
      // Si alguna de las ofertas se está pautando, el producto está activo.
      activo: g.some((p) => p.activo) || undefined,
      variantes: resto.map((p) => p.name),
    });
  }
  return salida;
}
