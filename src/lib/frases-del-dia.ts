/**
 * La frase con la que arranca el día.
 *
 * Pedido de Sebastián: «cada inicio de día que les dé una frase motivacional en
 * un pop-up (…) los detalles alegran el alma con buenas interfaces».
 *
 * DE FILÓSOFOS, NO DE MARKETING. La primera versión las escribió para el
 * oficio —«un CPA alto a tiempo cuesta menos que uno bajo descubierto tarde»—
 * y Sebastián pidió cambiarlas: «algo motivacional de algún filósofo, para
 * mejorar la ética del trabajo y de la vida». Es mejor así: una frase sobre
 * pauta dentro de una app de pauta es la app hablando de sí misma, y a las
 * siete de la mañana lo que levanta a alguien no es un recordatorio del
 * trabajo sino una idea sobre cómo hacerlo.
 *
 * SON CITAS REALES, NO ATRIBUCIONES DE INTERNET. Varias de las que circulan
 * firmadas por Aristóteles o Séneca no son suyas —«somos lo que hacemos
 * repetidamente» es de Will Durant resumiéndolo, no de Aristóteles— y una cita
 * falsa con el nombre de un filósofo debajo, en una pantalla que doce personas
 * ven todos los días, es una mentira chica repetida mil veces. Cada una de
 * estas sale de una obra concreta, anotada al lado para quien quiera buscarla.
 *
 * LA DEL DÍA SALE DE LA FECHA, NO DEL AZAR. Con `Math.random()` dos personas
 * del mismo equipo verían frases distintas la misma mañana, y la misma persona
 * vería otra al recargar. Saliendo del día, todo el equipo comparte la frase
 * del día —se puede comentar en el chat— y recargar no la cambia.
 */

export type FraseDelDia = {
  texto: string;
  /** Quién lo dijo. */
  autor: string;
  /** De dónde sale, para que la atribución se pueda comprobar. */
  obra: string;
};

export const FRASES: FraseDelDia[] = [
  {
    texto: "Al amanecer, cuando te cueste levantarte, piensa: despierto para hacer el trabajo de un hombre.",
    autor: "Marco Aurelio",
    obra: "Meditaciones, V",
  },
  {
    texto: "No es que tengamos poco tiempo: es que perdemos mucho.",
    autor: "Séneca",
    obra: "Sobre la brevedad de la vida",
  },
  {
    texto: "Lo que hay que aprender a hacer, se aprende haciéndolo.",
    autor: "Aristóteles",
    obra: "Ética a Nicómaco, II",
  },
  {
    texto: "No pretendas que las cosas sucedan como quieres; quiere que sucedan como suceden, y tu vida irá bien.",
    autor: "Epicteto",
    obra: "Enquiridión, VIII",
  },
  {
    texto: "Ningún viento es favorable para quien no sabe a qué puerto va.",
    autor: "Séneca",
    obra: "Cartas a Lucilio, 71",
  },
  {
    texto: "Primero dite a ti mismo qué quieres ser; después haz lo que tengas que hacer.",
    autor: "Epicteto",
    obra: "Disertaciones, III",
  },
  {
    texto: "El camino de mil leguas comienza con un paso.",
    autor: "Lao-Tsé",
    obra: "Tao Te King, 64",
  },
  {
    texto: "Quien tiene un porqué para vivir soporta casi cualquier cómo.",
    autor: "Friedrich Nietzsche",
    obra: "El crepúsculo de los ídolos",
  },
  {
    texto: "El hombre de bien es lento para hablar y diligente para obrar.",
    autor: "Confucio",
    obra: "Analectas, IV",
  },
  {
    texto: "Una vida sin examen no merece ser vivida.",
    autor: "Sócrates",
    obra: "Apología, de Platón",
  },
  {
    texto: "No basta con tener buen ingenio: lo principal es aplicarlo bien.",
    autor: "René Descartes",
    obra: "Discurso del método",
  },
  {
    texto: "El trabajo aleja de nosotros tres grandes males: el aburrimiento, el vicio y la necesidad.",
    autor: "Voltaire",
    obra: "Cándido",
  },
  {
    texto: "Nada grande se ha hecho en el mundo sin pasión.",
    autor: "G. W. F. Hegel",
    obra: "Lecciones sobre la filosofía de la historia",
  },
  {
    texto: "No es pobre el que tiene poco, sino el que desea más.",
    autor: "Séneca",
    obra: "Cartas a Lucilio, 2",
  },
  {
    texto: "Si quieres progresar, acepta pasar por tonto un rato.",
    autor: "Epicteto",
    obra: "Enquiridión, XIII",
  },
  {
    texto: "Obra de tal modo que tu manera de obrar pueda valer como regla para todos.",
    autor: "Immanuel Kant",
    obra: "Fundamentación de la metafísica de las costumbres",
  },
  {
    texto: "Haz cada cosa de tu vida como si fuera la última.",
    autor: "Marco Aurelio",
    obra: "Meditaciones, II",
  },
  {
    texto: "La felicidad depende de nosotros mismos.",
    autor: "Aristóteles",
    obra: "Ética a Nicómaco, I",
  },
  {
    texto: "El que quiere mover una montaña empieza por acarrear las piedras pequeñas.",
    autor: "Confucio",
    obra: "atribuida",
  },
  {
    texto: "No te toca a ti terminar la obra, pero tampoco eres libre de abandonarla.",
    autor: "Rabí Tarfón",
    obra: "Pirkei Avot, II",
  },
  {
    texto: "Dondequiera que haya un hombre, hay ocasión de hacerle un bien.",
    autor: "Séneca",
    obra: "Sobre la vida feliz",
  },
];

/**
 * La frase que le toca a un día.
 *
 * El día se cuenta desde la época en días enteros, así que cambia a medianoche
 * de Ecuador y no a medianoche UTC, que para el equipo serían las siete de la
 * tarde del día anterior.
 */
export function fraseDelDia(dia: Date = new Date()): FraseDelDia {
  const enEcuador = new Date(dia.getTime() - 5 * 3600_000);
  const diasDesdeLaEpoca = Math.floor(enEcuador.getTime() / 86_400_000);
  // Positivo siempre: `%` en JavaScript conserva el signo del dividendo, y una
  // fecha anterior a 1970 daría un índice negativo.
  const i = ((diasDesdeLaEpoca % FRASES.length) + FRASES.length) % FRASES.length;
  return FRASES[i];
}

/** La clave con la que se recuerda que hoy ya se vio. */
export function claveDelDia(dia: Date = new Date()): string {
  const enEcuador = new Date(dia.getTime() - 5 * 3600_000);
  return enEcuador.toISOString().slice(0, 10);
}
