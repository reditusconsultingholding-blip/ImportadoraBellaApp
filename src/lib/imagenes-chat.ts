/**
 * Qué capturas acepta el chat de Jarvis.
 *
 * La validación vive acá y no en la ruta para poder probarla. El contenido lo
 * manda el navegador, y un navegador puede mandar cualquier cosa: un PDF
 * renombrado, un archivo de cuarenta megas, un tipo que la API no entiende.
 * Rechazarlo con estas palabras es un error claro en la pantalla; no rechazarlo
 * es un 400 de la API con un mensaje en inglés que nadie entiende.
 */

export const TIPOS_DE_IMAGEN = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_IMAGENES = 4;

/**
 * Tope por imagen, en caracteres de base64 (unos 3 MB de archivo real).
 *
 * El navegador ya las reduce a 1.400 píxeles antes de subirlas, así que esto es
 * el cinturón por si esa reducción falla —un GIF no se toca, por ejemplo—, no el
 * límite de trabajo.
 */
export const MAX_BASE64 = 4 * 1024 * 1024;

type TurnoConImagenes = { imagenes?: { media_type?: unknown; data?: unknown }[] };

/** El problema encontrado, en castellano y listo para mostrar. O null. */
export function revisarImagenes(history: TurnoConImagenes[]): string | null {
  for (const turno of history) {
    if (turno?.imagenes == null) continue;
    if (!Array.isArray(turno.imagenes)) return "Las imágenes llegaron mal.";
    if (turno.imagenes.length > MAX_IMAGENES) {
      return `Máximo ${MAX_IMAGENES} imágenes por mensaje.`;
    }
    for (const img of turno.imagenes) {
      if (typeof img?.data !== "string" || typeof img?.media_type !== "string") {
        return "Las imágenes llegaron mal.";
      }
      if (!(TIPOS_DE_IMAGEN as readonly string[]).includes(img.media_type)) {
        return "Solo puedo leer imágenes PNG, JPG, WEBP o GIF.";
      }
      if (img.data.length > MAX_BASE64) {
        return "Esa imagen pesa demasiado. Recortala o bajale la calidad.";
      }
    }
  }
  return null;
}
