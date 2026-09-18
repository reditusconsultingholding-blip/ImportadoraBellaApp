// Constantes y tipos del control publicitario — sin acceso a la base.
//
// Vive aparte de control-publicitario.ts (que sí consulta con Prisma) para que
// las tablas, que son componentes de cliente, puedan importar las etiquetas y
// los tipos sin arrastrar Prisma al bundle del navegador. Mismo criterio que
// contenido-opciones.ts y pipeline-options.ts.

/**
 * Las horas de Ecuador en que se mira el día.
 *
 * Son acumulados del mismo día, no tramos: a las 11 está lo que va desde la
 * medianoche. El corte de las 23 es el día cerrado, y por eso es el que usan
 * los resúmenes del mes.
 */
export const HORAS_CORTE = [8, 11, 16, 23] as const;
export type HoraCorte = (typeof HORAS_CORTE)[number];

export const ETIQUETA_HORA: Record<number, string> = {
  8: "8 de la mañana",
  11: "11 de la mañana",
  16: "4 de la tarde",
  23: "Cierre del día",
};

export type FilaControl = {
  fecha: string; // "2026-09-18"
  hora: number;
  productId: string;
  producto: string;
  codigo: string;

  pedidos: number;
  pedidosReales: number;
  /** Reales menos atribuidos: lo que el equipo llama depurar los pedidos. */
  diferencia: number;
  cpa: number;
  gasto: number;

  efectividad: number;
  pedidosEfectivos: number;
  gastosOperativos: number;
  precioProm: number;
  ingresos: number;
  gastosAdm: number;
  utilidad: number;

  /** Si la economía usada es la del mes o el respaldo de la ficha. */
  economiaDelMes: boolean;
};

export type Totales = {
  pedidos: number;
  pedidosReales: number;
  gasto: number;
  ingresos: number;
  gastosOperativos: number;
  gastosAdm: number;
  utilidad: number;
  cpa: number;
  margen: number;
};

export type Control = {
  filas: FilaControl[];
  totales: Totales;
  /** Cuántas filas usaron el respaldo de la ficha en vez de la economía del mes. */
  sinEconomiaDelMes: number;
  /** Meses del rango que no tienen cargado el gasto administrativo. */
  mesesSinGastoAdm: string[];
};

export type FilaResumen = {
  productId: string;
  producto: string;
  codigo: string;
  pedidos: number;
  pedidosReales: number;
  cpa: number;
  ingresos: number;
  gasto: number;
  gastosOperativos: number;
  gastosAdm: number;
  utilidad: number;
  margen: number;
};
