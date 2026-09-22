import { db } from "@/lib/db";
import { ESTADOS_WINNER } from "@/lib/contenido";

// El reporte de un producto: cuál campaña rinde más, qué formato es el
// winner, y la evolución en tres cortes — diario, quincenal, histórico. Es
// lo que pidió Emilia para poder "estudiar un poco más a fondo" un producto
// sin salir de la app.

export type PeriodoReporte = "diario" | "quincenal" | "historico";

const OFFSET_HORAS = -5;

function localToday() {
  const now = new Date();
  const local = new Date(now.getTime() + OFFSET_HORAS * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/**
 * Los días del período, como marcas de día.
 *
 * MetricSnapshot.capturedAt es la medianoche UTC del día de Ecuador, no un
 * instante: antes se lo comparaba contra el instante corrido 5 horas, y la
 * marca del primer día (00:00) quedaba siempre antes del límite (05:00). El
 * corte "Diario" salía vacío todos los días y los otros perdían su primer día.
 */
export function rangoDe(periodo: PeriodoReporte) {
  const hoy = localToday();
  const desde = new Date(hoy);
  if (periodo === "diario") {
    // Sin cambio: hoy mismo.
  } else if (periodo === "quincenal") {
    desde.setUTCDate(desde.getUTCDate() - 14);
  } else {
    desde.setUTCDate(desde.getUTCDate() - 179); // ~6 meses de histórico
  }
  return { desdeDia: desde, hastaDia: new Date(hoy.getTime() + 86_400_000) };
}

export type CampanaDelReporte = {
  id: string;
  nombre: string;
  plataforma: string;
  gasto: number;
  compras: number;
  cpa: number | null;
  tipoCampana: string | null;
  lote: string | null;
};

export type ReporteProducto = {
  productId: string;
  code: string;
  nombre: string;
  periodo: PeriodoReporte;
  gastoTotal: number;
  comprasTotal: number;
  ingresoTotal: number;
  cpaPromedio: number | null;
  mejorCampana: CampanaDelReporte | null;
  peorCampana: CampanaDelReporte | null;
  campanas: CampanaDelReporte[];
  formatoWinner: { formato: string; piezas: number } | null;
  winners: number;
};

export async function reporteDeProducto(
  organizationId: string,
  code: string,
  periodo: PeriodoReporte
): Promise<ReporteProducto | null> {
  const product = await db.product.findFirst({
    where: { organizationId, code },
    select: { id: true, code: true, name: true, cpaTarget: true },
  });
  if (!product) return null;

  const { desdeDia, hastaDia } = rangoDe(periodo);

  const campanas = await db.campaign.findMany({
    where: { productId: product.id },
    select: {
      id: true,
      name: true,
      tipoCampana: true,
      adAccount: { select: { platform: true } },
      ronda: { select: { nomenclatura: true } },
      metrics: {
        where: { capturedAt: { gte: desdeDia, lt: hastaDia } },
        select: { spend: true, purchases: true, revenue: true },
      },
    },
  });

  const resumen: CampanaDelReporte[] = campanas
    .map((c) => {
      const gasto = c.metrics.reduce((s, m) => s + m.spend, 0);
      const compras = c.metrics.reduce((s, m) => s + m.purchases, 0);
      return {
        id: c.id,
        nombre: c.name,
        plataforma: c.adAccount.platform,
        gasto,
        compras,
        cpa: compras > 0 ? gasto / compras : null,
        tipoCampana: c.tipoCampana,
        lote: c.ronda?.nomenclatura ?? null,
      };
    })
    .filter((c) => c.gasto > 0 || c.compras > 0);

  const gastoTotal = resumen.reduce((s, c) => s + c.gasto, 0);
  const comprasTotal = resumen.reduce((s, c) => s + c.compras, 0);
  const ingresoTotal = campanas.reduce((s, c) => s + c.metrics.reduce((s2, m) => s2 + m.revenue, 0), 0);

  // Mejor campaña: la de más compras entre las que tienen CPA razonable — no
  // simplemente "la de menor CPA", porque una campaña con 1 sola compra
  // barata no dice nada. Entre las que compraron, gana la de menor CPA.
  const conCompras = resumen.filter((c) => c.compras > 0);
  const mejorCampana =
    conCompras.length > 0
      ? [...conCompras].sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity))[0]
      : null;
  const peorCampana =
    conCompras.length > 1
      ? [...conCompras].sort((a, b) => (b.cpa ?? 0) - (a.cpa ?? 0))[0]
      : null;

  const piezasWinner = await db.requirement.groupBy({
    by: ["visualFormat"],
    where: { organizationId, productId: product.id, estado: { in: ESTADOS_WINNER } },
    _count: { _all: true },
  });
  const formatoWinner =
    piezasWinner.length > 0
      ? [...piezasWinner].sort((a, b) => b._count._all - a._count._all)[0]
      : null;

  return {
    productId: product.id,
    code: product.code,
    nombre: product.name,
    periodo,
    gastoTotal,
    comprasTotal,
    ingresoTotal,
    cpaPromedio: comprasTotal > 0 ? gastoTotal / comprasTotal : null,
    mejorCampana,
    peorCampana,
    campanas: resumen.sort((a, b) => b.gasto - a.gasto),
    formatoWinner: formatoWinner
      ? { formato: formatoWinner.visualFormat, piezas: formatoWinner._count._all }
      : null,
    winners: piezasWinner.reduce((s, g) => s + g._count._all, 0),
  };
}
