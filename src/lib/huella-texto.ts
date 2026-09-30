/**
 * Una huella corta y estable de un texto.
 *
 * Existe por un problema concreto de los audios pregrabados: la pantalla y la
 * voz son dos copias de lo mismo, y en cuanto alguien corrige una y no la otra,
 * la capacitación empieza a decir algo distinto de lo que muestra. No falla
 * ruidosamente — se queda explicando una pantalla que ya cambió, que es la
 * peor forma de estar mal, porque quien la escucha no tiene cómo saberlo.
 *
 * Con esto, cada grabación queda atada al texto exacto con el que se hizo. Si
 * el texto cambia, la huella deja de coincidir y ese paso vuelve solo a la voz
 * del navegador: peor voz, pero diciendo la verdad.
 *
 * Es FNV-1a, no un hash criptográfico, y a propósito: hace falta que dé el
 * MISMO resultado en Node (donde se graba) y en el navegador (donde se
 * reproduce), sin depender de `crypto.subtle`, que es asíncrono y obligaría a
 * volver async toda la reproducción. No se está defendiendo nada de un
 * atacante: se está detectando una edición.
 */
export function huellaDeTexto(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    // El multiplicador de FNV, con desplazamientos para no perder precisión:
    // h * 16777619 se pasa de los 32 bits exactos que aguanta un número de
    // JavaScript y empieza a redondear, que rompe la estabilidad.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
