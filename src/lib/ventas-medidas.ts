import type { Granularidad } from "@/lib/reporte-medidas";
import type { OpcionGranularidad } from "@/lib/serie-cubos";

// Las formas de la serie de ventas del Panel, sin nada que toque la base.
//
// Mismo motivo que reporte-medidas.ts: el gráfico corre en el navegador y no
// puede importar el módulo que consulta Prisma.

export type CuboVentas = {
  /** El arranque del cubo, ISO. Sirve de clave estable en React. */
  clave: string;
  /** Lo corto, para el eje X. */
  etiqueta: string;
  /** Lo largo, para la lectura y la tabla. */
  detalle: string;
  ordenes: number;
  /**
   * Facturación real de Shopify.
   *
   * El campo NO EXISTE para quien no tiene permiso de finanzas — no viene en
   * cero ni en null. Esconderlo con CSS no serviría: el número viajaría igual
   * dentro del HTML de la página y estaría a un clic derecho de distancia.
   */
  facturado?: number;
  /**
   * Que no haya nada que saber de este cubo: o todavía no llegó, o es anterior
   * a la primera orden guardada. Es distinto de haber vendido cero, y por eso
   * no se dibuja barra en vez de dibujarla en el piso.
   */
  sinDatos: boolean;
  /**
   * Que el cubo esté a medio transcurrir —la hora en curso, el mes que recién
   * empieza— o cortado por el borde del período. El dato sirve, pero comparar
   * su altura contra la de un cubo completo hace ver una caída que no hubo.
   */
  parcial: boolean;
};

export type VistaVentas = {
  granularidad: Granularidad;
  cubos: CuboVentas[];
  /** Cuántos cubos no tienen de dónde salir, para decirlo abajo del gráfico. */
  sinDatos: number;
  /** Cuántos están incompletos, por la misma razón. */
  parciales: number;
};

export type SerieVentas = {
  /** Sin tienda conectada la pantalla lo dice, en vez de dibujar ceros. */
  hayTienda: boolean;
  /** Las cuatro granularidades, con el motivo de las que no se pueden elegir. */
  opciones: OpcionGranularidad[];
  /** Con cuál se abre el período. */
  porDefecto: Granularidad;
  /**
   * Una vista por granularidad ofrecible, todas ya armadas.
   *
   * Van todas juntas a propósito: las órdenes se consultan UNA vez y repartirlas
   * de tres formas distintas es trabajo en memoria. Así cambiar de granularidad
   * es instantáneo y no vuelve a pedirle la pantalla entera al servidor.
   */
  vistas: VistaVentas[];
  totales: { ordenes: number; facturado?: number };
  /**
   * El día de la orden más vieja guardada, ISO. Cuando el período empieza antes
   * de eso hay barras sin dato, y la pantalla dice por qué en vez de dibujar
   * una caída que nunca pasó.
   */
  ventasDesde: string | null;
};
