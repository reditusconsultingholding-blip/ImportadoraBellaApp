/**
 * Prepara una captura para mandársela a Jarvis.
 *
 * Una captura de pantalla de un monitor moderno son 3 o 4 MB. Mandarla tal cual
 * tiene tres problemas: tarda en subir con la conexión de una oficina, el
 * modelo la recorta igual, y se paga por un detalle que nadie va a usar — el
 * modelo no lee mejor un número por tener más píxeles alrededor.
 *
 * Así que se reduce acá, en el navegador, antes de subir. El lado largo queda en
 * 1.400 píxeles, que es el tamaño con el que la API trabaja sin reescalar: más
 * grande es peso tirado, más chico empieza a perderse el texto chico de un
 * administrador de anuncios, que es justo lo que hay que leer.
 *
 * Sale en JPEG al 85% salvo que venga con transparencia, que se mantiene en PNG:
 * un PNG con fondo transparente pasado a JPEG queda con el fondo negro, y una
 * captura de un logo recortado se vuelve ilegible.
 */

const LADO_MAXIMO = 1400;
const CALIDAD = 0.85;

export type ImagenLista = {
  media_type: string;
  /** El contenido en base64, sin el prefijo `data:`. */
  data: string;
  /** Para mostrar la miniatura en el chat sin volver a leer el archivo. */
  vistaPrevia: string;
  nombre: string;
};

/** Los tipos que el modelo entiende. Un .heic de iPhone no está en la lista. */
export const TIPOS_ACEPTADOS = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function cargar(archivo: File): Promise<HTMLImageElement> {
  return new Promise((listo, falla) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      // La URL temporal se suelta en cuanto la imagen está decodificada; si no,
      // cada captura adjuntada deja un objeto retenido hasta recargar.
      URL.revokeObjectURL(url);
      listo(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      falla(new Error("No pude abrir esa imagen."));
    };
    img.src = url;
  });
}

export async function reducirImagen(archivo: File): Promise<ImagenLista> {
  if (!TIPOS_ACEPTADOS.includes(archivo.type)) {
    throw new Error("Solo puedo leer imágenes PNG, JPG, WEBP o GIF.");
  }

  // Los GIF no se tocan: redibujarlos en un canvas se queda con el primer
  // fotograma, y si alguien manda un GIF es porque el movimiento dice algo.
  if (archivo.type === "image/gif") {
    const dataUrl = await leerComoDataUrl(archivo);
    return {
      media_type: archivo.type,
      data: dataUrl.slice(dataUrl.indexOf(",") + 1),
      vistaPrevia: dataUrl,
      nombre: archivo.name,
    };
  }

  const img = await cargar(archivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight));
  const ancho = Math.max(1, Math.round(img.naturalWidth * escala));
  const alto = Math.max(1, Math.round(img.naturalHeight * escala));

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador no pudo procesar la imagen.");

  // Suavizado en alta calidad: sin esto, el texto chico de una captura reducida
  // sale con bordes quebrados y se vuelve más difícil de leer, que es lo
  // contrario de lo que se busca.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, ancho, alto);

  const conTransparencia = archivo.type === "image/png" || archivo.type === "image/webp";
  const tipoSalida = conTransparencia ? "image/png" : "image/jpeg";
  const dataUrl = canvas.toDataURL(tipoSalida, CALIDAD);

  return {
    media_type: tipoSalida,
    data: dataUrl.slice(dataUrl.indexOf(",") + 1),
    vistaPrevia: dataUrl,
    nombre: archivo.name,
  };
}

function leerComoDataUrl(archivo: File): Promise<string> {
  return new Promise((listo, falla) => {
    const lector = new FileReader();
    lector.onload = () => listo(String(lector.result));
    lector.onerror = () => falla(new Error("No pude leer esa imagen."));
    lector.readAsDataURL(archivo);
  });
}
