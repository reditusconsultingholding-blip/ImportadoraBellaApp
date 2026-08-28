// Listas de opciones del pipeline creativo (SuperAds Ops). Viven aquí,
// no como enum de la base, para poder agregar una opción nueva sin
// pedir una migración cada vez que el equipo cambia el criterio.

export const AD_TYPES = [
  "ORIGINAL",
  "FASE 1",
  "FASE 2 / HOOK",
  "FASE 2 / GUION",
  "FASE 2 / CTA",
  "VARIANTE",
  "IMG ANUNCIO",
  "IMAGEN",
] as const;

export const PHASES = ["F1", "F2", "CT 1.0", "CT 4.0", "OP", "Escala"] as const;

export const VISUAL_FORMATS = [
  "UGC con Persona",
  "Talking Head sin Cortes",
  "Ugly Ad / One-take",
  "VSL Corta",
  "Long-Form Video",
  "Demo sin Persona",
  "Antes / Después",
  "Testimonial Real en Video",
  "Respuesta a Comentario",
  "Grid Ad / Estático",
  "UGC Estático",
  "Testimonial Screenshot",
  "Founder / Texto — Carrusel",
  "Frankenstein",
  "Problema / Solución",
  "Beneficios",
] as const;

export const ANGLES = [
  "Frustración Acumulada",
  "Dolor Hiperspecífico",
  "Vergüenza Social",
  "Miedo a Empeorar",
  "Resultado con Métricas",
  "Transformación Emocional",
  "Resultado Rápido",
  "Resultado Lifestyle",
  "Testimonial Real",
  "Número de Clientes",
  "Vs. Alternativas",
  "Review Screenshot",
  "Ingrediente / Mecanismo",
  "Comparación Lógica",
  "Dato Sorprendente",
  "Desmitificación",
  "Identidad Deseada",
  "Pertenencia / Tribu",
  "Merecimiento",
  "Orgullo Local / COD",
  "Objeción de Precio",
  "Objeción Funciona",
  "Objeción Seguridad",
  "Objeción Tiempo",
  "Pregunta Directa",
  "Pattern Interrupt",
  "Micro Historia",
  "Unboxing",
  "Beneficios",
  "Modo de uso",
] as const;

export const AWARENESS_LEVELS = [
  "L1 — Unaware",
  "L2 — Problem Aware",
  "L3 — Solution Aware",
  "L4 — Product Aware",
  "L5 — Most Aware",
] as const;

export const MARKET_ORIGINS = ["Perú (propio)", "USA", "España", "México", "Colombia", "Otro"] as const;

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
