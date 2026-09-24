// Los tres CPA, con UN nombre cada uno.
//
// Fabricio, por WhatsApp: "si quisiera estandarizar conceptos, xq x un lado
// esta cpa ideal y x otro cpa objetivo". Tenia razon, y era peor de lo que se
// ve desde una pantalla sola: la MISMA cifra —el techo con colchon del
// producto, Product.cpaTarget— se llamaba "ideal" en la calculadora y en el
// control, y "objetivo" en el Pulso, en Origen, en la ficha del producto y en
// la tabla de anuncios. El punto de equilibrio venia en cuatro variantes:
// "breakeven", "equilibrio", "equil." y "punto de equilibrio".
//
// Dos nombres para un numero no es un problema de prolijidad. El equipo sube
// campanas mirando estas pantallas: quien aprendio "ideal" en una y lee
// "objetivo" en otra no sabe si esta mirando lo mismo o una tercera cosa, y la
// decision que toma con eso es cuanta plata seguir poniendo.
//
// Los nombres salen de aca y de ningun otro lado. Si manana hay que cambiarlos,
// se cambian una vez.

/** Lo que se esta pagando hoy por cada venta. */
export const CPA_REAL = "CPA real";

/**
 * La meta. Es el de equilibrio con 30% de colchon: apuntar al equilibrio exacto
 * es trabajar gratis. Vive en Product.cpaTarget.
 */
export const CPA_OBJETIVO = "CPA objetivo";

/**
 * El techo. Un dolar mas y la venta cuesta mas de lo que deja.
 *
 * Fabricio: "igual es importante que se salga el cpa breackeven para que sepan
 * cuando se esta perdiendo plata". Por eso va al lado del objetivo en todas las
 * pantallas donde alguien decide si sigue gastando.
 */
export const CPA_EQUILIBRIO = "CPA de equilibrio";

/** Para los textos de ayuda, para que digan siempre lo mismo. */
export const QUE_ES_OBJETIVO = "la meta: deja 30% de colchon sobre el equilibrio";
export const QUE_ES_EQUILIBRIO = "el techo: arriba de esto cada venta pierde plata";
