// La base de conocimiento de Jarvis.
//
// Son los principios con los que se opera un ecommerce de contraentrega en
// LatAm pauteando en Meta y TikTok. Están acá y no en el prompt del modelo por
// dos razones: se pueden corregir sin tocar código de la conversación, y sobre
// todo se pueden CITAR — una recomendación que dice de dónde sale se puede
// discutir; una que no, solo se puede creer o no creer.
//
// No es una enciclopedia. Es lo que cambia decisiones: umbrales, diagnósticos y
// la lógica de por qué un número significa lo que significa.

export type Tema =
  | "economia"
  | "creativo"
  | "meta"
  | "tiktok"
  | "cro"
  | "escalado"
  | "producto"
  | "cod";

export type Principio = {
  tema: Tema;
  titulo: string;
  texto: string;
  /** De dónde viene la idea. Se cita para que la recomendación sea discutible. */
  fuente?: string;
};

export const PRINCIPIOS: Principio[] = [
  // --- La economía del negocio -------------------------------------------
  {
    tema: "economia",
    titulo: "En contraentrega no se cobra lo que se vende",
    texto:
      "Se cobra lo que se confirma Y no se devuelve. La fórmula es entregados = efectividad × (1 − devoluciones). Un producto con 90% de margen bruto y 30% de efectividad pierde plata en cada venta. Cualquier análisis de rentabilidad que no aplique esos dos factores describe un negocio distinto al de contraentrega.",
  },
  {
    tema: "economia",
    titulo: "El flete se paga sobre lo despachado, no sobre lo entregado",
    texto:
      "Un paquete que se despacha y vuelve costó el flete igual. Por eso el flete se multiplica por la efectividad (todo lo confirmado) y no por los entregados. Calcularlo sobre los entregados subestima el costo justo de los productos con más devoluciones, que son los que hay que vigilar.",
  },
  {
    tema: "economia",
    titulo: "El CPA de equilibrio es el techo, no la meta",
    texto:
      "CPA breakeven = precio×entregados − costo×entregados − flete×efectividad − gastoAdmin×entregados. Apuntar exactamente al breakeven significa trabajar gratis: cualquier variación de la efectividad deja el mes en rojo. Un objetivo sano deja 25-30% de colchón por debajo.",
  },
  {
    tema: "economia",
    titulo: "La contribución manda sobre el ROAS",
    texto:
      "El ROAS no distingue entre un producto de 90% de margen y uno de 20%. Dos campañas con ROAS 3 pueden dejar plata muy distinta. Lo que decide es la contribución por checkout: lo que queda después de producto, flete, administrativo y pauta.",
    fuente: "Práctica estándar de media buying con margen (Common Thread, Ecommerce Fastlane)",
  },

  // --- Creativo -----------------------------------------------------------
  {
    tema: "creativo",
    titulo: "El creativo es la variable con más apalancamiento",
    texto:
      "En cuentas maduras, la segmentación aporta poco: el algoritmo encuentra a la audiencia. La diferencia entre un CPA de 5 y uno de 15 casi siempre está en el creativo, no en la configuración de la campaña. Por eso el volumen de producción creativa predice el crecimiento mejor que cualquier ajuste de puja.",
    fuente: "Principio central de Motion App y del equipo creativo de Meta",
  },
  {
    tema: "creativo",
    titulo: "El hook decide en los primeros tres segundos",
    texto:
      "Hook rate = (reproducciones de 3s ÷ impresiones) × 100. Por debajo de 15% el problema es el primer frame y no vale la pena optimizar nada más. Entre 25% y 40% es sano. Por encima de 40% hay margen para escalar. Un hold rate alto con hook bajo significa que el contenido es bueno pero nadie llega a verlo.",
  },
  {
    tema: "creativo",
    titulo: "Diversidad, no volumen",
    texto:
      "Cuatro creativos del mismo formato y ángulo compiten entre sí y miden una sola cosa: se gastó cuatro veces el presupuesto para aprender lo mismo. Una ronda útil varía formato, ángulo y nivel de consciencia. Al menos una pieza debe ser L1 o L2 para no saturar el funnel, y al menos una estática.",
  },
  {
    tema: "creativo",
    titulo: "Un ganador se itera, no se reemplaza",
    texto:
      "Cuando un creativo funciona, la fase 2 mantiene lo que funcionó y cambia una sola variable: el hook, el guion o el CTA. Cambiar todo a la vez destruye la señal y obliga a volver a empezar.",
  },
  {
    tema: "creativo",
    titulo: "La fatiga se lee en la frecuencia y el CPM",
    texto:
      "Frecuencia por encima de 2,5 en audiencia fría con CPM subiendo indica que la audiencia ya vio el anuncio. El CPA sube por saturación, no porque el creativo haya empeorado. La respuesta es renovar creativo, no bajar el presupuesto.",
  },

  // --- Meta ---------------------------------------------------------------
  {
    tema: "meta",
    titulo: "Cambios grandes de presupuesto reinician el aprendizaje",
    texto:
      "Subir el presupuesto más de 20-30% de golpe devuelve el conjunto a fase de aprendizaje y el CPA se dispara unos días. Escalar de a 20% cada 2-3 días mantiene la estabilidad. Si hace falta escalar rápido, conviene duplicar la campaña en vez de multiplicar el presupuesto de la existente.",
  },
  {
    tema: "meta",
    titulo: "50 conversiones por semana por conjunto",
    texto:
      "Meta necesita ese volumen para salir de aprendizaje. Por debajo, el rendimiento es errático y las conclusiones no son confiables. Con presupuesto chico conviene consolidar conjuntos en vez de repartirlo entre muchos.",
    fuente: "Documentación de Meta sobre la fase de aprendizaje",
  },
  {
    tema: "meta",
    titulo: "No se juzga una campaña antes de 3 días o 50 clics",
    texto:
      "Apagar por un mal día es la forma más cara de equivocarse: la varianza diaria en cuentas chicas es enorme. La ventana mínima honesta para decidir son 3 días o 50 clics, lo que llegue después.",
  },
  {
    tema: "meta",
    titulo: "La atribución de la plataforma cuenta de más",
    texto:
      "Meta y TikTok se atribuyen la misma venta si la persona vio ambos anuncios. Sumar las compras atribuidas de las dos plataformas siempre da más que las órdenes reales. Las decisiones de plata se toman con las órdenes de la tienda; la atribución sirve para comparar campañas entre sí, no para contar ventas.",
  },

  // --- TikTok -------------------------------------------------------------
  {
    tema: "tiktok",
    titulo: "El creativo tiene que parecer contenido, no anuncio",
    texto:
      "Lo que rinde en TikTok es lo que no parece pauta: grabado en vertical con teléfono, sin producción evidente, con audio y ritmo nativos. Un anuncio de televisión reciclado tiene hook rate bajo casi garantizado.",
  },
  {
    tema: "tiktok",
    titulo: "El ciclo de vida creativo es más corto",
    texto:
      "Un creativo que en Meta rinde un mes, en TikTok se satura en una o dos semanas. La reposición tiene que ser más frecuente, y la planificación de producción debe contemplarlo.",
  },
  {
    tema: "tiktok",
    titulo: "TikTok nombra las métricas distinto",
    texto:
      "Las compras están en complete_payment y el valor en total_complete_payment_rate — el nombre dice 'rate' pero es un valor absoluto. Pedirle a TikTok los nombres de campo de Meta devuelve cero sin error, que es peor que fallar: parece que la campaña no vendió.",
  },

  // --- CRO y conversión ---------------------------------------------------
  {
    tema: "cro",
    titulo: "La velocidad de carga es conversión",
    texto:
      "Cada segundo adicional de carga en móvil cuesta conversión de forma medible. En tráfico pago la pérdida es doble: se paga por el clic y además se pierde la venta. Antes de optimizar copy, conviene medir cuánto tarda la landing en un teléfono con red móvil.",
    fuente: "Estudios de Google/Deloitte sobre velocidad móvil y conversión",
  },
  {
    tema: "cro",
    titulo: "Menos campos, más pedidos",
    texto:
      "En contraentrega el formulario debería pedir lo mínimo: nombre, teléfono y dirección. Cada campo adicional cuesta conversión. El correo, si no se usa para nada operativo, es un campo que resta.",
    fuente: "Baymard Institute, investigación sobre abandono de checkout",
  },
  {
    tema: "cro",
    titulo: "La landing tiene que continuar el anuncio",
    texto:
      "El mayor asesino de conversión es la desconexión entre lo que promete el anuncio y lo que muestra la landing. Si el anuncio habla de un dolor específico, la landing tiene que abrir con ese dolor — no con el nombre de la marca.",
  },
  {
    tema: "cro",
    titulo: "Las objeciones se responden antes de que aparezcan",
    texto:
      "Precio, si funciona, si es seguro y cuánto tarda: esas cuatro dudas deciden la compra. Una landing que las responde arriba convierte mejor que una que las esconde en un FAQ al pie.",
  },
  {
    tema: "cro",
    titulo: "El ticket sube con bundles, no con descuentos",
    texto:
      "Subir el AOV mediante packs mejora el CPA efectivo sin tocar la pauta: la misma venta paga más. Descontar hace lo contrario. En contraentrega, además, un pack de dos unidades reparte el flete entre más producto.",
  },
  {
    tema: "cro",
    titulo: "Un test necesita volumen para significar algo",
    texto:
      "Comparar dos landings con 40 visitas cada una no prueba nada; la diferencia que se ve es ruido. Antes de declarar un ganador conviene tener unos cientos de conversiones o aceptar que la decisión es una apuesta.",
  },

  // --- Escalado -----------------------------------------------------------
  {
    tema: "escalado",
    titulo: "Se escala lo que tiene margen, no lo que tiene ROAS alto",
    texto:
      "La pregunta correcta no es 'cuál tiene mejor ROAS' sino 'cuánto más puedo pagar por venta antes de dejar de ganar'. Un producto con CPA de 5 y equilibrio de 14 aguanta casi el triple de costo por venta: ahí está la oportunidad, aunque su ROAS sea menor que el de otro.",
  },
  {
    tema: "escalado",
    titulo: "Escalar sin creativos nuevos acelera la saturación",
    texto:
      "Al subir el presupuesto sube la frecuencia, y el creativo se gasta antes. Un escalado sostenido necesita reposición creativa planificada, no solo más plata en la misma pieza.",
  },
  {
    tema: "escalado",
    titulo: "Lo que da la señal más honesta es la ventana semanal",
    texto:
      "Comparar los últimos 7 días contra los 7 anteriores filtra el ruido de los días sueltos y detecta tendencias reales. Dos puntos consecutivos no son una tendencia.",
  },

  // --- Producto -----------------------------------------------------------
  {
    tema: "producto",
    titulo: "El producto decide más que la pauta",
    texto:
      "Ninguna optimización salva a un producto con margen insuficiente o efectividad baja. Antes de invertir en creativos, conviene verificar que la economía cierre: si el CPA de equilibrio es de 3 dólares, no hay creativo que alcance.",
  },
  {
    tema: "producto",
    titulo: "La efectividad de confirmación es una palanca de producto",
    texto:
      "Subir la confirmación del 50% al 65% mueve la rentabilidad más que bajar el CPA un 20%, y suele depender de cosas operativas: velocidad de contacto, guion de la llamada, claridad del anuncio sobre el precio y el envío.",
  },
  {
    tema: "producto",
    titulo: "Un mes en curso siempre se ve peor",
    texto:
      "Los pedidos de contraentrega tardan días en confirmarse y entregarse. La efectividad del mes abierto es artificialmente baja y no describe al producto. Para juzgar, se usan meses cerrados.",
  },

  // --- Operación COD ------------------------------------------------------
  {
    tema: "cod",
    titulo: "La velocidad de contacto define la confirmación",
    texto:
      "El pedido se confirma mucho mejor si se llama en la primera hora. Cada hora que pasa baja la probabilidad de contacto y sube la de arrepentimiento. Es la variable operativa más barata de mejorar.",
  },
  {
    tema: "cod",
    titulo: "Las devoluciones se concentran geográficamente",
    texto:
      "Las tasas de entrega varían mucho por provincia y por transportadora. Medir la efectividad por zona permite decidir dónde conviene exigir prepago, cambiar de operador o simplemente no pautear.",
  },
  {
    tema: "cod",
    titulo: "Un cliente que repite no cuesta pauta",
    texto:
      "La segunda compra de un cliente existente tiene CPA cero. En operaciones que solo miran adquisición, ese margen se ignora por completo. Medir qué porción de la facturación viene de quienes repiten cambia dónde conviene invertir.",
  },
];

/**
 * Los principios que vienen al caso para una pregunta.
 *
 * Se eligen por palabras clave y no se mandan todos: el prompt completo son
 * miles de tokens que hacen la respuesta más lenta y más genérica. Trae los que
 * tocan el tema, y si no reconoce ninguno, un núcleo mínimo.
 */
export function principiosRelevantes(pregunta: string, tope = 8): Principio[] {
  const texto = pregunta
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

  const señales: Record<Tema, string[]> = {
    economia: ["rentab", "margen", "utilidad", "equilibrio", "breakeven", "costo", "flete", "gana", "pierde", "plata"],
    creativo: ["creativ", "anuncio", "hook", "video", "angulo", "formato", "ronda", "pieza", "editor", "fatiga"],
    meta: ["meta", "facebook", "fb", "conjunto", "aprendizaje", "presupuesto", "cbo", "abo"],
    tiktok: ["tiktok", "tik tok"],
    cro: ["cro", "conversion", "landing", "checkout", "formulario", "pagina", "carrito", "ticket", "aov", "bundle", "pack"],
    escalado: ["escal", "subir", "aumentar", "crecer", "apagar", "pausar", "matar"],
    producto: ["producto", "catalogo", "efectividad", "confirmacion", "sku"],
    cod: ["contraentrega", "cod", "devolucion", "entrega", "provincia", "transportadora", "llamada", "cliente", "repite"],
  };

  const puntaje = new Map<Tema, number>();
  for (const [tema, palabras] of Object.entries(señales) as [Tema, string[]][]) {
    const n = palabras.filter((p) => texto.includes(p)).length;
    if (n > 0) puntaje.set(tema, n);
  }

  if (puntaje.size === 0) {
    // Sin tema claro, el núcleo: la economía del negocio y el peso del creativo.
    return PRINCIPIOS.filter(
      (p) => p.tema === "economia" || p.titulo.includes("apalancamiento")
    ).slice(0, tope);
  }

  const temas = [...puntaje.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const elegidos: Principio[] = [];
  for (const t of temas) {
    for (const p of PRINCIPIOS.filter((x) => x.tema === t)) {
      if (elegidos.length >= tope) break;
      elegidos.push(p);
    }
  }
  return elegidos;
}

/** Los principios en el formato en que se le pasan al modelo. */
export function comoTexto(principios: Principio[]) {
  return principios
    .map((p) => `- ${p.titulo}: ${p.texto}${p.fuente ? ` (${p.fuente})` : ""}`)
    .join("\n");
}
