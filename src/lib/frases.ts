/**
 * Dónde termina la última frase cerrada de un texto.
 *
 * Sirve para leer en voz alta una respuesta que todavía se está escribiendo: se
 * habla hasta acá y el resto espera al pedazo siguiente. Sin esto hay que
 * esperar la respuesta completa, que en una llamada son veinte o treinta
 * segundos de silencio con el micrófono cerrado.
 *
 * LA CONDICIÓN DEL ESPACIO ES TODO EL ASUNTO. El punto tiene que estar seguido
 * de un espacio o del final del texto. Sin eso, "el CPA es 7.40" se partiría en
 * "el CPA es 7." y la voz diría "siete punto" y se callaría a mitad del número
 * —justo con las cifras, que es lo único que no se puede entender a medias—.
 * Pasa igual con "$1.065" y con "3.5 veces".
 *
 * Devuelve la posición siguiente al signo, o -1 si no hay ninguna frase cerrada.
 */
export function finDeFraseCerrada(texto: string): number {
  // El salto de línea va aparte y sin la condición del espacio: es un corte por
  // sí mismo. Metido en el grupo de arriba, "Pará\nmirá esto" no cortaba nunca
  // —porque después del salto viene una letra— y Jarvis se quedaba callado
  // esperando un punto que esa línea no iba a tener.
  const marcas = /[.!?…:;](?=\s|$)|\n/g;
  let fin = -1;
  let m: RegExpExecArray | null;
  while ((m = marcas.exec(texto)) !== null) fin = m.index + 1;
  return fin;
}
