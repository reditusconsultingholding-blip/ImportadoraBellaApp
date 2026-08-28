// Listas de opciones del pipeline creativo (SuperAds V2). Viven aquí, no como
// enum de la base, para poder agregar una opción nueva sin pedir una migración
// cada vez que el equipo cambia el criterio.

export const AD_TYPES = [
  "FASE 1",
  "ORIGINAL",
  "FASE 2 / HOOK",
  "FASE 2 / GUION",
  "FASE 2 / CTA",
  "VARIANTE",
  "IMG ANUNCIO",
  "IMAGEN",
] as const;

export const PHASES = ["F1", "F2", "CT 1.0", "CT 4.0", "OP", "Escala"] as const;

export const VISUAL_FORMATS = [
  "UGC con persona",
  "Talking head sin cortes",
  "Ugly ad / One take",
  "VSL corta",
  "Long form video",
  "Demo sin persona",
  "Antes / Después",
  "Testimonio real en video",
  "Respuesta a comentario",
  "Grid ad / Estático",
  "UGC estático",
  "Testimonial screenshot",
  "Founder / Texto carrusel",
  "Frankenstein",
  "Problema / Solución",
  "Beneficios",
] as const;

export const ANGLES = [
  "Frustración acumulada",
  "Dolor hiperespecífico",
  "Vergüenza social",
  "Miedo a empeorar",
  "Resultados con métricas",
  "Transformación emocional",
  "Resultado rápido",
  "Resultado lifestyle",
  "Testimonial real",
  "Número de clientes",
  "Vs. alternativas",
  "Review screenshot",
  "Ingredientes / Mecanismo",
  "Comparación lógica",
  "Dato sorprendente",
  "Desmitificación",
  "Identidad deseada",
  "Pertenencia / Tribu",
  "Merecimiento",
  "Orgullo local / COD",
  "Objeción de precio",
  "Objeción funciona",
  "Objeción seguridad",
  "Objeción tiempo",
  "Pregunta directa",
  "Pattern interrupt",
  "Micro historia",
  "Unboxing",
  "Beneficios",
  "Modo de uso",
] as const;

export const AWARENESS_LEVELS = [
  "L1 — Unaware",
  "L2 — Problem aware",
  "L3 — Solution aware",
  "L4 — Product aware",
  "L5 — Most aware",
] as const;

export const MARKET_ORIGINS = [
  "USA",
  "Perú",
  "España",
  "México",
  "Colombia",
  "Ecuador",
  "Otro",
] as const;

/**
 * En qué punto del proceso está la pieza: quién la tiene y qué falta para que
 * salga. Es la columna "situación" de la planilla, y la que mueve las tarjetas
 * del pipeline.
 */
export const REQUIREMENT_STATUSES = [
  "PENDIENTE",
  "EN_EDICION",
  "LISTO_PARA_REVISAR",
  "APROBADO",
  "REALIZADO",
  "EDITADO",
  "TESTEADO",
] as const;

export const STATUS_LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente",
  EN_EDICION: "En edición",
  LISTO_PARA_REVISAR: "Listo para revisar",
  APROBADO: "Aprobado",
  REALIZADO: "Realizado",
  EDITADO: "Editado",
  TESTEADO: "Testeado",
};

/**
 * Qué está haciendo la pieza EN LA PAUTA. Es distinto de la situación: una
 * pieza puede estar "testeada" (situación) y ser un "winner validado" o un
 * "kill definitivo" (estado). Mezclarlas hace imposible responder algo tan
 * básico como "¿cuántos winners tenemos?".
 */
export const ESTADOS_CREATIVO = [
  "Pendiente de lanzar",
  "En testeo",
  "Sin data",
  "Kill temprano",
  "Kill definitivo",
  "Potencial",
  "Segunda oportunidad",
  "Winner inicial",
  "Winner validado",
  "En OP",
  "En escalamiento",
  "Saturado",
  "Fatiga de funnel",
  "Reemplazado",
] as const;

/** Qué hacer con la pieza a continuación. */
export const PROXIMAS_ACCIONES = [
  "Testear",
  "Producir",
  "Descartar",
  "Mantener observación",
  "Hook swap",
  "CTA swap",
  "Ángulo nuevo",
  "Declarar winner",
  "Pedir fase 2",
  "Retestear variante",
  "Pasar a OP",
  "Escalar",
  "Renovar por saturación",
] as const;

/**
 * Qué significa cada columna nueva y cómo se llena.
 *
 * Vive en el código y se muestra en pantalla, en vez de quedar en un documento
 * aparte: una convención que hay que ir a buscar a otro lado es una convención
 * que la mitad del equipo no sigue.
 */
export const GUIA_COLUMNAS: { columna: string; tipo: string; para: string }[] = [
  {
    columna: "Formato visual",
    tipo: "Desplegable",
    para: "Cuál de los formatos es el anuncio. Garantiza que una ronda no tenga 4 ads del mismo formato. Andromeda agrupa formatos iguales.",
  },
  {
    columna: "Ángulo",
    tipo: "Desplegable",
    para: "Cuál de los ángulos narrativos usa: el significado semántico del mensaje. Dos ads del mismo ángulo compiten entre sí.",
  },
  {
    columna: "Awareness level",
    tipo: "Desplegable",
    para: "L1 a L5, el nivel de consciencia del espectador. Mínimo 1 ad por ronda debe ser L1 o L2 para no saturar el funnel.",
  },
  {
    columna: "Mercado origen",
    tipo: "Desplegable",
    para: "De qué mercado salió la referencia. Permite rastrear qué mercados dan mejores conceptos.",
  },
  {
    columna: "Hook rate %",
    tipo: "Número",
    para: "(reproducciones de 3 segundos ÷ impresiones) × 100. Diagnostica el primer frame: por debajo de 15% pausar, entre 25 y 40% es bueno, por encima de 40% escalar.",
  },
];

/** Las reglas que tiene que cumplir cada ronda de 4 piezas. */
export const REGLAS_DE_RONDA: string[] = [
  "Los 4 ads de una ronda deben tener FORMATO distinto entre sí.",
  "Los 4 ads de una ronda deben tener ÁNGULO distinto entre sí.",
  "Al menos 1 ad por ronda debe ser awareness L1 o L2.",
  "Al menos 1 ad por ronda debe ser estático o imagen (no todos video).",
  "Si dos ads comparten formato + ángulo + awareness, Andromeda los agrupa como uno solo.",
];

/** Los formatos que cuentan como estáticos, para poder verificar la regla 4. */
export const FORMATOS_ESTATICOS: string[] = [
  "Grid ad / Estático",
  "UGC estático",
  "Testimonial screenshot",
  "Founder / Texto carrusel",
];

/** Un hook rate se lee distinto según el tramo. */
export function leerHookRate(valor: number | null) {
  if (valor == null) return null;
  if (valor < 15) return { texto: "Pausar", tono: "malo" as const };
  if (valor < 25) return { texto: "Flojo", tono: "medio" as const };
  if (valor <= 40) return { texto: "Bueno", tono: "bueno" as const };
  return { texto: "Escalar", tono: "bueno" as const };
}

/**
 * Cómo se escribió históricamente cada opción en la planilla, contra cómo se
 * llama oficialmente ahora.
 *
 * No son erratas a corregir en el Excel: son datos que ya existen y que hay
 * que hacer aterrizar en la opción buena. Sin esto, tres ángulos del histórico
 * quedaban fuera de todas las listas y no se podían filtrar ni contar.
 */
export const ALIAS: Record<string, string> = {
  "INGREDIENTE MECANISMO": "Ingredientes / Mecanismo",
  "DOLOR HIPERSPECIFICO": "Dolor hiperespecífico",
  "RESULTADO CON METRICAS": "Resultados con métricas",
  "TESTIMONIO REAL EN VIDEO": "Testimonio real en video",
  "TESTIMONIAL REAL EN VIDEO": "Testimonio real en video",
  "UGLY AD ONE TAKE": "Ugly ad / One take",
  "FOUNDER TEXTO CARRUSEL": "Founder / Texto carrusel",
  "GRID AD ESTATICO": "Grid ad / Estático",
};
