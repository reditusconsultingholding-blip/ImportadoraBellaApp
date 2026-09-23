// Leer un número tal como lo escribe una persona.
//
// EL PROBLEMA
// La calculadora hacía `Number(v) || 0`. En Ecuador, Colombia y media
// Latinoamérica el separador decimal es la COMA, así que escribir "28,50" —la
// forma natural de escribir el costo de un producto— daba NaN y el `|| 0` lo
// convertía en CERO. Sin error, sin aviso, sin nada rojo: el costo pasaba a
// valer cero, el precio sugerido se desplomaba y el margen salía enorme.
//
// Y al revés: los campos eran `<input type="number">`, que en un navegador con
// configuración regional en español directamente RECHAZA la coma. La tecla no
// llega al estado, el número no cambia, y desde afuera se ve como que la
// pantalla "no se actualiza" — que es exactamente como lo reportaron.
//
// LA REGLA
// Se acepta lo que la gente escribe y no al revés:
//   "28.50"     → 28.5    (punto decimal, lo de siempre)
//   "28,50"     → 28.5    (coma decimal)
//   "1.234,56"  → 1234.56 (punto de miles, coma decimal)
//   "1,234.56"  → 1234.56 (al revés, como en inglés)
//   "$ 28,50"   → 28.5    (pegado desde otro lado)
//   ""  "abc"   → 0
//
// Cuando aparecen los dos separadores, el que está MÁS A LA DERECHA es el
// decimal y el otro es de miles. No hay que adivinar: es cierto en las dos
// convenciones.
//
// Un solo punto se deja como decimal —es lo que ya hacía y lo que espera quien
// escribe "28.5"—, así que "1.234" sigue siendo mil doscientos treinta y
// cuatro milésimas. Cambiar eso rompería lo que hoy funciona bien, y quien
// escribe miles casi siempre los escribe sin separador.

/** Un número escrito por una persona, o 0 si no hay nada que leer. */
export function aNumero(valor: string | number | null | undefined): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  if (valor == null) return 0;

  // Fuera todo lo que no sea dígito, separador o signo: símbolos de moneda,
  // espacios, espacios duros de un copiar y pegar.
  const limpio = String(valor).replace(/[^\d.,-]/g, "");
  if (!limpio) return 0;

  const ultimaComa = limpio.lastIndexOf(",");
  const ultimoPunto = limpio.lastIndexOf(".");

  let normalizado: string;
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    // Están los dos: el de más a la derecha manda.
    const decimal = ultimaComa > ultimoPunto ? "," : ".";
    const miles = decimal === "," ? "." : ",";
    normalizado = limpio.split(miles).join("").replace(decimal, ".");
  } else if (ultimaComa >= 0) {
    // Solo coma: es el decimal.
    normalizado = limpio.replace(/,/g, ".");
  } else {
    normalizado = limpio;
  }

  // Un solo punto decimal: si quedaron varios, los de la izquierda eran de
  // miles ("1.234.567" → 1234567).
  const trozos = normalizado.split(".");
  if (trozos.length > 2) {
    normalizado = trozos.slice(0, -1).join("") + "." + trozos[trozos.length - 1];
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : 0;
}
