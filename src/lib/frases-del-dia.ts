/**
 * La frase con la que arranca el día.
 *
 * Pedido de Sebastián: «cada inicio de día que les dé una frase motivacional en
 * un pop-up (…) los detalles alegran el alma con buenas interfaces».
 *
 * NO SON FRASES DE TAZA. Están escritas para este negocio y para lo que esta
 * gente hace de verdad: pauta que se revisa a primera hora, pedidos que se
 * confirman por teléfono, creativos que se prueban y se caen. Una frase
 * genérica de superación personal en una herramienta de trabajo se lee como
 * relleno y se cierra sin leer; una que nombra el oficio, no.
 *
 * LA DEL DÍA SALE DE LA FECHA, NO DEL AZAR. Con `Math.random()` dos personas
 * del mismo equipo verían frases distintas la misma mañana, y la misma persona
 * vería otra al recargar. Saliendo del día, todo el equipo comparte la frase
 * del día —se puede comentar en el chat— y recargar no la cambia.
 */

export type FraseDelDia = {
  texto: string;
  /** Quién lo dijo, o null cuando es de la casa. */
  autor: string | null;
};

export const FRASES: FraseDelDia[] = [
  { texto: "Lo que no se mide, se adivina. Y adivinar sale caro.", autor: null },
  { texto: "Un CPA alto a tiempo cuesta menos que un CPA bajo descubierto tarde.", autor: null },
  { texto: "El mejor creativo no es el más bonito: es el que todavía funciona el día quince.", autor: null },
  { texto: "La disciplina es elegir entre lo que quieres ahora y lo que quieres más.", autor: "Abraham Lincoln" },
  { texto: "Nada reemplaza revisar la pauta antes de las ocho.", autor: null },
  { texto: "Haz lo que puedas, con lo que tengas, donde estés.", autor: "Theodore Roosevelt" },
  { texto: "Un pedido confirmado vale más que diez carritos llenos.", autor: null },
  { texto: "La calidad no es un acto, es un hábito.", autor: "Aristóteles" },
  { texto: "Escalar lo que funciona es más rentable que rescatar lo que no.", autor: null },
  { texto: "El éxito es la suma de pequeños esfuerzos repetidos día tras día.", autor: "Robert Collier" },
  { texto: "Si el número te sorprende, revísalo antes de festejarlo.", autor: null },
  { texto: "No cuentes los días: haz que los días cuenten.", autor: "Muhammad Ali" },
  { texto: "Cada producto sin economía cargada es plata que no sabemos si ganamos.", autor: null },
  { texto: "La suerte es lo que pasa cuando la preparación encuentra la oportunidad.", autor: "Séneca" },
  { texto: "Probar barato y rápido vence a planear caro y lento.", autor: null },
  { texto: "La paciencia es amarga, pero su fruto es dulce.", autor: "Jean-Jacques Rousseau" },
  { texto: "Un equipo que se avisa a tiempo gana más que uno que trabaja de más.", autor: null },
  { texto: "Empieza donde estás. Usa lo que tienes. Haz lo que puedas.", autor: "Arthur Ashe" },
  { texto: "El margen se defiende en el costo, no solo en el precio.", autor: null },
  { texto: "La constancia vence lo que la dicha no alcanza.", autor: "Simón Bolívar" },
  { texto: "Hoy también se puede batir el récord de ayer.", autor: null },
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
