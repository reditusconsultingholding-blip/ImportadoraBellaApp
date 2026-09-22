// Buscar un producto escribiendo, como se busca un contacto en el teléfono.
//
// "Que pueda tipear y con las iniciales del producto me salgan": el catálogo
// tiene más de cien productos y bajar por un desplegable hasta encontrar uno
// era la parte lenta de cada pantalla. Acá se aceptan cuatro formas de
// escribirlo, de la más exacta a la más suelta:
//   1. el código ("1771…"),
//   2. el comienzo del nombre ("gotas de"),
//   3. el comienzo de varias palabras ("got dren"),
//   4. las iniciales ("gdl" → Gotas De drenaje Linfático; se pueden saltear
//      palabras: "gdl" también encuentra "Gotas de Drenaje Linfático").
// Sin tildes ni mayúsculas: "linfatico" encuentra "LINFÁTICO".

const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const palabras = (s: string) => plano(s).split(/[^a-z0-9]+/).filter(Boolean);

/** ¿Las letras de `aguja` aparecen en `pajar` en el mismo orden? */
function enOrden(aguja: string, pajar: string) {
  let i = 0;
  for (const c of pajar) if (c === aguja[i]) i += 1;
  return i === aguja.length;
}

/**
 * Qué tan bien coincide un producto con lo escrito. Menor es mejor; null si no
 * coincide. Sirve para filtrar y para ordenar a la vez.
 */
export function puntajeProducto(consulta: string, nombre: string, codigo = ""): number | null {
  const q = plano(consulta);
  if (!q) return 0;
  const n = plano(nombre);
  const c = plano(codigo);
  const qSin = q.replace(/[^a-z0-9]/g, "");

  if (c && c === qSin) return 0;
  if (c && c.startsWith(qSin)) return 1;
  if (n.startsWith(q)) return 2;

  const ps = palabras(nombre);
  const iniciales = ps.map((p) => p[0]).join("");
  if (qSin && iniciales.startsWith(qSin)) return 3;

  // Cada palabra escrita es el comienzo de alguna palabra del nombre.
  const qs = palabras(consulta);
  if (qs.length > 1 && qs.every((t) => ps.some((p) => p.startsWith(t)))) return 4;
  if (qs.length === 1 && ps.some((p) => p.startsWith(qs[0]))) return 5;

  // Iniciales salteando palabras ("gdl" en "gotas de drenaje linfatico").
  if (qSin.length >= 2 && !/\d/.test(qSin) && enOrden(qSin, iniciales)) return 6;

  if (n.includes(q) || (c && c.includes(qSin))) return 7;
  return null;
}

/** Filtra y ordena una lista de productos por lo escrito. */
export function buscarProductos<T>(
  lista: T[],
  consulta: string,
  datos: (x: T) => { nombre: string; codigo?: string },
  tope = 50,
): T[] {
  if (!plano(consulta)) return lista.slice(0, tope);
  return lista
    .map((x) => {
      const d = datos(x);
      return { x, p: puntajeProducto(consulta, d.nombre, d.codigo), nombre: d.nombre };
    })
    .filter((r): r is { x: T; p: number; nombre: string } => r.p != null)
    .sort((a, b) => a.p - b.p || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, tope)
    .map((r) => r.x);
}
