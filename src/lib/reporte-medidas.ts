// Las formas y los umbrales de la serie del período, sin nada que toque la
// base de datos.
//
// Están separados de reporte-serie.ts por una razón concreta: el gráfico es un
// componente de cliente y necesita el umbral y los nombres. Si los importara
// desde reporte-serie.ts se arrastraría Prisma al paquete del navegador, que
// no puede correr ahí. Los tipos solos no molestan —`import type` desaparece al
// compilar—, pero una constante sí viaja.

export type Granularidad = "dia" | "semana" | "mes";

export type CuboSerie = {
  /** Primer día del cubo, ISO. Sirve de clave estable en React. */
  clave: string;
  /** Lo corto, para el eje X. */
  etiqueta: string;
  /** Lo largo, para el tooltip y la tabla. */
  detalle: string;
  facturado: number;
  ordenes: number;
  gasto: number;
  /**
   * Gasto sobre facturado, 0-100. Es `null` —y no cero— cuando no hubo
   * facturación: sin ventas el porcentaje no existe, y dibujar un 0 ahí diría
   * "ese día la pauta no costó nada".
   */
  pesoPauta: number | null;
};

export type SerieDelPeriodo = {
  granularidad: Granularidad;
  cubos: CuboSerie[];
  totales: { facturado: number; ordenes: number; gasto: number; pesoPauta: number | null };
  /** Sin tienda conectada la pantalla lo dice, en vez de dibujar ceros. */
  hayTienda: boolean;
};

/** Cómo se llama la unidad de la serie, para escribirla en pantalla. */
export const NOMBRE_GRANULARIDAD: Record<Granularidad, string> = {
  dia: "por día",
  semana: "por semana",
  mes: "por mes",
};

/**
 * Por encima de este porcentaje la pauta se está comiendo el negocio. Es el
 * mismo umbral con el que el PDF diario pinta en rojo la tarjeta de gasto:
 * vive acá para que la pantalla y el PDF no puedan discrepar.
 */
export const LIMITE_PESO_PAUTA = 35;
