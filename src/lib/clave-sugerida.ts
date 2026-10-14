/**
 * Una contraseña inicial para alguien que entra al equipo.
 *
 * POR QUÉ LA GENERA LA APP Y NO LA PERSONA QUE DA EL ALTA.
 *
 * Dar de alta a un compañero obligaba a inventar una contraseña en el momento,
 * con el formulario abierto y alguien esperando. Lo que sale de ahí es siempre
 * la misma familia: el nombre de la empresa con un número, o la de la cuenta
 * anterior. Y después hay que dictarla por teléfono.
 *
 * Esto arma una que no se puede adivinar y que igual se puede leer en voz alta
 * sin equivocarse.
 *
 * LAS LETRAS QUE NO ESTÁN. Falta la l minúscula, la I mayúscula, la O, el 0 y
 * el 1: son los pares que se confunden al dictar y al copiar a mano de una
 * pantalla. Perder cinco símbolos de setenta baja poquísimo la fuerza y evita
 * el "no me entra la clave" que termina en otro mensaje.
 *
 * CUÁNTO AGUANTA. Son 24 caracteres de un alfabeto de 57: alrededor de 140 bits
 * de entropía, varios órdenes de magnitud por encima de lo que se podría probar
 * a fuerza bruta contra un bcrypt. No hay que estirarla más.
 */

const LETRAS = "abcdefghijkmnpqrstuvwxyz";
const MAYUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const NUMEROS = "23456789";
const ALFABETO = LETRAS + MAYUSCULAS + NUMEROS;

/** Cuántos caracteres tiene la clave sugerida. */
const LARGO = 24;
/** Cada cuántos caracteres se corta en grupos, para poder leerla. */
const GRUPO = 6;

/**
 * Un entero de 0 a `tope` sin sesgo.
 *
 * `% tope` sobre un byte al azar favorece a los primeros valores cuando 256 no
 * es múltiplo del tope. Acá se descartan los bytes de la cola, que es la forma
 * barata de que todas las letras tengan la misma probabilidad.
 */
function azar(tope: number) {
  const limite = Math.floor(256 / tope) * tope;
  const buffer = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < limite) return buffer[0] % tope;
  }
}

/**
 * La clave, en grupos separados por guiones.
 *
 * Los guiones son parte de la contraseña, no una decoración que haya que
 * quitar: dictarla por teléfono o copiarla de un papel es el caso real.
 */
export function claveSugerida(): string {
  const letras = Array.from({ length: LARGO }, () => ALFABETO[azar(ALFABETO.length)]);
  const grupos: string[] = [];
  for (let i = 0; i < letras.length; i += GRUPO) {
    grupos.push(letras.slice(i, i + GRUPO).join(""));
  }
  return grupos.join("-");
}
