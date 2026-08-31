// Las frases que se ponen donde antes iba una cifra.
//
// Viven aparte de `finanzas.ts` porque ese módulo consulta la base, y las
// pantallas del navegador —el Pulso, por ejemplo— también necesitan estos
// textos. Importarlos desde allá arrastraría Prisma al paquete del cliente.

/**
 * Lo que se dice cuando un bloque entero de dinero no se dibuja.
 *
 * No se deja un cero ni un guion en su lugar: un cero se lee como un dato y
 * hace pensar que el producto no gastó nada. Se explica el hueco y se sigue.
 */
export const AVISO_SIN_CIFRAS =
  "Las cifras de dinero —gasto, CPA, ingreso y utilidad— las ve la dirección. Acá quedan el rendimiento y qué conviene hacer.";

/**
 * El reemplazo de un motivo escrito con montos adentro.
 *
 * Los motivos de una propuesta y las notas de quien decide son texto guardado:
 * si lo escribió alguien que sí veía las cifras, ahí quedaron. Se reemplaza la
 * frase entera y no se le tachan los números — media frase con huecos se lee
 * como un error de la app.
 */
export const MOTIVO_CON_CIFRAS =
  "El motivo está escrito con cifras de dinero, que ve la dirección.";
