// Anuncios al equipo: la forma del dato y los límites del texto.
//
// Vive fuera de las rutas porque lo comparten tres pantallas —el apartado del
// chat donde se publican, la lista de los ya publicados y el aviso que corta el
// paso al entrar a la app— y el servidor. Sin un lugar común, el largo máximo
// del título terminaba escrito cuatro veces y siendo distinto en dos de ellas.
//
// No importa `db`: lo consume también código del navegador, y arrastrar el
// cliente de Prisma al paquete del cliente lo rompería.

/**
 * Tope del título.
 *
 * Es lo único que se lee sin abrir nada —en la campana del aviso y en la lista—
 * así que si no entra en una línea deja de funcionar como título. Ciento veinte
 * caracteres es una frase completa sin llegar a párrafo.
 */
export const MAX_TITULO = 120;

/**
 * Tope del cuerpo.
 *
 * Cuatro mil caracteres son unas dos carillas. El anuncio es un aviso que la
 * gente lee de parado al entrar a la app, no un documento; lo largo va en un
 * enlace dentro del texto.
 */
export const MAX_CUERPO = 4000;

export type AnuncioVista = {
  id: string;
  titulo: string;
  cuerpo: string;
  createdAt: string;
  autor: { id: string; name: string };
  /** Si ya lo acusó quien está mirando. */
  visto: boolean;
  /** Cuántas personas del equipo ya lo acusaron. */
  vistoPor: number;
  /** Cuántas podrían verlo, para leer "3 de 8" y no un número suelto. */
  destinatarios: number;
  archivado: boolean;
};

/**
 * Revisa un anuncio antes de guardarlo y devuelve el motivo del rechazo, o
 * null si está bien.
 *
 * La usan la ruta y el formulario. En el formulario es para no ofrecer un botón
 * que va a rebotar; el chequeo que vale es el del servidor.
 */
export function revisarAnuncio(titulo: string, cuerpo: string): string | null {
  const t = titulo.trim();
  const c = cuerpo.trim();
  if (t.length < 3) return "Ponle un título al anuncio.";
  if (t.length > MAX_TITULO) return `El título no puede pasar de ${MAX_TITULO} caracteres.`;
  if (c.length < 3) return "Escribe el anuncio.";
  if (c.length > MAX_CUERPO) return `El anuncio no puede pasar de ${MAX_CUERPO} caracteres.`;
  return null;
}
