// Las fórmulas del control publicitario, sin base de datos.
//
// Viven aparte de control-publicitario.ts para poder probarlas solas: son las
// que deciden la utilidad que ve dirección, y un cambio distraído en una de
// ellas mueve miles de dólares en el resumen del mes sin que nada falle a la
// vista. Las pruebas están en tests/control-calculo.test.ts.

/** El gasto administrativo del mes se reparte en treinta días, como el Excel. */
export const DIAS_DEL_MES = 30;

export type EconomiaFila = {
  efectividad: number;
  produccion: number;
  flete: number;
  precioProm: number;
};

/**
 * La economía de una fila (un producto en un día).
 *
 * - Pedidos efectivos = pedidos × efectividad.
 * - Ingresos = precio promedio × pedidos efectivos.
 * - Gastos operativos = (producción + flete) × pedidos efectivos. Es la
 *   fórmula que el Excel QUERÍA calcular; la suya caía en CPA mínimo y
 *   % de devoluciones (un $6,15 fijo) y subestimaba el costo un 28%.
 */
export function economiaDeFila(pedidos: number, e: EconomiaFila | undefined) {
  const efectividad = e?.efectividad ?? 0;
  const pedidosEfectivos = pedidos * efectividad;
  const gastosOperativos = ((e?.produccion ?? 0) + (e?.flete ?? 0)) * pedidosEfectivos;
  const precioProm = e?.precioProm ?? 0;
  const ingresos = precioProm * pedidosEfectivos;
  return { efectividad, pedidosEfectivos, gastosOperativos, precioProm, ingresos };
}

/**
 * La parte del gasto administrativo que le toca a una fila.
 *
 * El total del mes se divide entre treinta y ese monto diario se reparte
 * según la proporción de pedidos de la fila sobre los del DÍA ENTERO (no
 * sobre los del filtro): filtrar un producto no le puede cargar la
 * administración de todos.
 */
export function repartoAdministrativo(totalMes: number, pedidosDelDia: number, pedidosFila: number) {
  if (pedidosDelDia <= 0) return 0;
  return (pedidosFila / pedidosDelDia) * (totalMes / DIAS_DEL_MES);
}

/** Utilidad real = ingresos − pauta − operativos − administrativos. */
export function utilidad(ingresos: number, gasto: number, gastosOperativos: number, gastosAdm: number) {
  return ingresos - gasto - gastosOperativos - gastosAdm;
}

/**
 * El CPA máximo que se puede pagar sin perder plata: el punto de equilibrio.
 *
 * Fabricio lo pidió con todas las letras: "quiero que cada uno de los asesores
 * que suben campañas sepa cuál es el CPA ideal y cuál es el CPA break even,
 * para que sepan hasta cuándo podemos". El ideal es el objetivo del producto;
 * el de equilibrio es el techo: un dólar más y la venta cuesta más de lo que
 * deja.
 *
 * Sale de despejar la utilidad en cero sobre lo que ya calcula el control:
 *
 *   utilidad = ingresos − pauta − operativos − administrativos = 0
 *   ⟹ pauta = ingresos − operativos − administrativos
 *   ⟹ CPA de equilibrio = (ingresos − operativos − admin) ÷ pedidos
 *
 * Se calcula sobre la fila y no con una fórmula propia a propósito: si mañana
 * cambia cómo se reparte la administración o cómo se cuentan los operativos,
 * el punto de equilibrio cambia con ellos en vez de quedarse mintiendo.
 *
 * Devuelve null cuando no hay con qué: sin pedidos, o sin economía cargada
 * —ahí los ingresos son cero y el "equilibrio" daría un número negativo que se
 * leería como que el producto pierde siempre—.
 */
export function cpaDeEquilibrio(f: {
  pedidos: number;
  ingresos: number;
  gastosOperativos: number;
  gastosAdm: number;
}): number | null {
  if (f.pedidos <= 0 || f.ingresos <= 0) return null;
  return (f.ingresos - f.gastosOperativos - f.gastosAdm) / f.pedidos;
}

/** CPA sobre pedidos reales. Sin pedidos no hay CPA (0, no infinito). */
export function cpa(gasto: number, pedidos: number) {
  return pedidos > 0 ? gasto / pedidos : 0;
}

export type SumaControl = {
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

/**
 * Totales de un conjunto de filas. El CPA y el margen se recalculan sobre las
 * sumas: promediar los CPA de cada fila daría el mismo peso a un producto de
 * 3 pedidos que a uno de 300.
 */
export function sumarFilas(
  filas: Pick<SumaControl, "pedidos" | "pedidosPlataforma" | "gasto" | "ingresos" | "gastosOperativos" | "gastosAdm" | "utilidad">[],
): SumaControl {
  const t: SumaControl = {
    pedidos: 0,
    pedidosPlataforma: 0,
    gasto: 0,
    ingresos: 0,
    gastosOperativos: 0,
    gastosAdm: 0,
    utilidad: 0,
    cpa: 0,
    margen: 0,
  };
  for (const f of filas) {
    t.pedidos += f.pedidos;
    t.pedidosPlataforma += f.pedidosPlataforma;
    t.gasto += f.gasto;
    t.ingresos += f.ingresos;
    t.gastosOperativos += f.gastosOperativos;
    t.gastosAdm += f.gastosAdm;
    t.utilidad += f.utilidad;
  }
  t.cpa = cpa(t.gasto, t.pedidos);
  t.margen = t.ingresos > 0 ? t.utilidad / t.ingresos : 0;
  return t;
}
