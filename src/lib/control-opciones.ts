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
 * los resúmenes del período.
 */
export const HORAS_CORTE = [8, 11, 16, 23] as const;
export type HoraCorte = (typeof HORAS_CORTE)[number];

export const ETIQUETA_HORA: Record<number, string> = {
  8: "8 de la mañana",
  11: "11 de la mañana",
  16: "4 de la tarde",
  23: "Cierre del día",
};

/** El nombre de la fila que junta lo que no tiene producto. */
export const ETIQUETA_SIN_ASIGNAR = "Sin producto asignado";

/**
 * Una fila del control: un producto (o lo sin asignar), un día, un corte.
 *
 * `pedidos` son los pedidos REALES de la tienda, uno por compra. Es el número
 * con el que trabaja el equipo: los que se atribuyen las plataformas vienen
 * inflados por el píxel, la zona horaria y la ventana de atribución —en julio,
 * la herramienta de terceros decía 8.064 y fueron 7.466—, así que quedan como
 * referencia en `pedidosPlataforma` y nada se calcula sobre ellos.
 */
export type FilaControl = {
  fecha: string; // "2026-09-18"
  hora: number;
  /** null es la fila "sin producto asignado". */
  productId: string | null;
  producto: string;
  codigo: string;

  pedidos: number;
  pedidosPlataforma: number;
  cpa: number;
  /** El CPA objetivo del producto: el "ideal". null en la fila sin asignar. */
  cpaObjetivo: number | null;
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

/** Lo mismo, sumado sobre todo el período elegido. */
export type FilaPeriodo = Omit<FilaControl, "fecha" | "hora" | "precioProm"> & {
  margen: number;
  /** Cuántos días del período tuvieron movimiento. */
  dias: number;
};

export type Totales = {
  pedidos: number;
  pedidosPlataforma: number;
  gasto: number;
  ingresos: number;
  gastosOperativos: number;
  gastosAdm: number;
  utilidad: number;
  cpa: number;
  margen: number;
};

/** Un día del período, para la línea de tiempo. */
export type PuntoDia = {
  fecha: string;
  pedidos: number;
  gasto: number;
  ingresos: number;
  utilidad: number;
};

export type ControlPeriodo = {
  productos: FilaPeriodo[];
  /** Gasto y pedidos que no tienen producto; null si se filtró por producto. */
  sinAsignar: FilaPeriodo | null;
  totales: Totales;
  porDia: PuntoDia[];
  /** El detalle día por día, para la vista "por día". */
  filas: FilaControl[];
  avisos: {
    /** Meses del rango que no tienen cargado el gasto administrativo. */
    mesesSinGastoAdm: string[];
    /** Productos calculados con la ficha en vez de la economía del mes. */
    productosSinEconomia: number;
    /** Pedidos reales cuyo producto no está enlazado. */
    pedidosSinAsignar: number;
    /** Pedidos de testeo del período: existen, no se cuentan. */
    pedidosTesteo: number;
  };
};

/* ------------------------------ Compatibilidad ----------------------------- */

// La vista anterior del control usaba estos nombres. Se mantienen como alias
// para no romper lo que todavía los importa.
export type Control = ControlPeriodo;
export type FilaResumen = FilaPeriodo;

/** El período que muestra el control según la URL (compartido con el precálculo del reloj). */
export function resolverPeriodo(p: { periodo?: string; desde?: string; hasta?: string }, hoy: Date) {
  const dia = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const ayer = new Date(hoy.getTime() - 86400_000);
  const inicioMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));

  if (p.desde && p.hasta) {
    return {
      id: "personalizado",
      desde: new Date(`${p.desde}T00:00:00.000Z`),
      hasta: new Date(`${p.hasta}T00:00:00.000Z`),
    };
  }
  const m = /^mes-(\d{4})-(\d{1,2})$/.exec(p.periodo ?? "");
  if (m) {
    const anio = Number(m[1]);
    const mes = Number(m[2]);
    const fin = new Date(Date.UTC(anio, mes, 0));
    return { id: p.periodo!, desde: new Date(Date.UTC(anio, mes - 1, 1)), hasta: fin < hoy ? fin : ayer };
  }
  switch (p.periodo) {
    case "ayer":
      return { id: "ayer", desde: dia(ayer), hasta: dia(ayer) };
    case "7d":
      return { id: "7d", desde: new Date(hoy.getTime() - 7 * 86400_000), hasta: ayer };
    case "30d":
      return { id: "30d", desde: new Date(hoy.getTime() - 30 * 86400_000), hasta: ayer };
    case "mes-pasado": {
      const desde = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, 1));
      return { id: "mes-pasado", desde, hasta: new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 0)) };
    }
    default:
      // Este mes, hasta ayer: el día en curso no tiene cierre todavía. El primer
      // día del mes no hay "hasta ayer" dentro del mes, así que se muestra ayer.
      return hoy.getUTCDate() === 1
        ? { id: "ayer", desde: dia(ayer), hasta: dia(ayer) }
        : { id: "este-mes", desde: inicioMes, hasta: ayer };
  }
}
