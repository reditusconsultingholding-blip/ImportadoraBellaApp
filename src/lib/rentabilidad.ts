import { db } from "@/lib/db";
import { calcular, economiaDe } from "@/lib/economia";
import type { Range } from "@/lib/date-range";

// Rentabilidad por producto, calculada.
//
// La pantalla anterior leía una tabla que nunca llenó nadie: estaba vacía desde
// el día uno. Ahora sale de lo que ya está sincronizado — gasto de pauta por
// campaña, compras atribuidas, y la economía real que el equipo lleva en su
// planilla (precio, costo, flete, efectividad, devoluciones).
//
// La cuenta es la del negocio, no la de un ecommerce normal: de cada compra que
// la pauta se atribuye, solo una parte se confirma y de esa parte una porción
// se devuelve. El flete se paga sobre TODO lo despachado, se devuelva o no.

export type FilaRentabilidad = {
  productId: string;
  code: string;
  name: string;

  gastoPauta: number;
  comprasAtribuidas: number;
  cpa: number | null;

  /** Con economía cargada; sin ella el resto de la fila es null. */
  tieneEconomia: boolean;
  economiaDe: string | null;
  efectividad: number | null;
  devoluciones: number | null;

  /** Compras que llegan a cobrarse. */
  entregados: number | null;
  ingreso: number | null;
  costoMercaderia: number | null;
  costoFlete: number | null;
  utilidad: number | null;
  /** Utilidad sobre ingreso. */
  margen: number | null;

  cpaBreakeven: number | null;
  cpaObjetivo: number | null;
};

export type Rentabilidad = {
  filas: FilaRentabilidad[];
  totales: {
    gastoPauta: number;
    ingreso: number;
    utilidad: number;
    comprasAtribuidas: number;
    conEconomia: number;
    sinEconomia: number;
  };
  /**
   * Órdenes reales de Shopify en el mismo período, para poder juzgar cuánto se
   * está sobreatribuyendo. Sin este contraste, una utilidad calculada sobre
   * compras atribuidas se lee como si fuera plata en el banco.
   */
  contraste: {
    ordenesShopify: number;
    facturadoShopify: number;
    vecesAtribuido: number | null;
  };
};

export async function getRentabilidad(
  organizationId: string,
  range: Range
): Promise<Rentabilidad> {
  const [productos, ventas] = await Promise.all([
    db.product.findMany({
      where: { organizationId, archived: false },
      select: {
        id: true,
        code: true,
        name: true,
        salePrice: true,
        unitCost: true,
        efectividad: true,
        devoluciones: true,
        flete: true,
        gastoAdmPorPedido: true,
        economiaDe: true,
        campaigns: {
          select: {
            metrics: {
              where: { capturedAt: { gte: range.from, lte: range.to } },
              select: { spend: true, purchases: true },
            },
          },
        },
      },
    }),
    db.shopifyOrder.aggregate({
      where: {
        store: { organizationId },
        occurredAt: { gte: range.fromInstant, lte: range.toInstant },
      },
      _count: { _all: true },
      _sum: { netSales: true },
    }),
  ]);

  const filas: FilaRentabilidad[] = [];

  for (const p of productos) {
    let gastoPauta = 0;
    let comprasAtribuidas = 0;
    for (const c of p.campaigns) {
      for (const m of c.metrics) {
        gastoPauta += m.spend;
        comprasAtribuidas += m.purchases;
      }
    }
    if (gastoPauta <= 0 && comprasAtribuidas <= 0) continue;

    const cpa = comprasAtribuidas > 0 ? gastoPauta / comprasAtribuidas : null;
    const economia = economiaDe(p);

    if (!economia || p.efectividad == null) {
      filas.push({
        productId: p.id,
        code: p.code,
        name: p.name,
        gastoPauta,
        comprasAtribuidas,
        cpa,
        tieneEconomia: false,
        economiaDe: p.economiaDe,
        efectividad: p.efectividad,
        devoluciones: p.devoluciones,
        entregados: null,
        ingreso: null,
        costoMercaderia: null,
        costoFlete: null,
        utilidad: null,
        margen: null,
        cpaBreakeven: null,
        cpaObjetivo: null,
      });
      continue;
    }

    const cuentas = calcular(economia, cpa);
    const entregados = comprasAtribuidas * cuentas.entregados;
    const ingreso = entregados * economia.precio;
    const costoMercaderia = entregados * economia.costo;
    // El flete va sobre lo DESPACHADO: todo lo que se confirmó, se devuelva o
    // no. Multiplicarlo por los entregados subestimaría el costo justo de los
    // productos con más devoluciones, que son los que hay que vigilar.
    const costoFlete = comprasAtribuidas * economia.efectividad * economia.flete;
    const utilidad = ingreso - costoMercaderia - costoFlete - gastoPauta;

    filas.push({
      productId: p.id,
      code: p.code,
      name: p.name,
      gastoPauta,
      comprasAtribuidas,
      cpa,
      tieneEconomia: true,
      economiaDe: p.economiaDe,
      efectividad: p.efectividad,
      devoluciones: p.devoluciones,
      entregados,
      ingreso,
      costoMercaderia,
      costoFlete,
      utilidad,
      margen: ingreso > 0 ? utilidad / ingreso : null,
      cpaBreakeven: cuentas.cpaBreakeven,
      cpaObjetivo: cuentas.cpaObjetivo,
    });
  }

  // Primero lo que más plata pierde, después lo que más gana. Lo urgente
  // arriba, y lo bueno también a la vista para saber dónde escalar.
  filas.sort((a, b) => {
    const ua = a.utilidad ?? 0;
    const ub = b.utilidad ?? 0;
    if (ua < 0 && ub >= 0) return -1;
    if (ub < 0 && ua >= 0) return 1;
    if (ua < 0 && ub < 0) return ua - ub;
    return b.gastoPauta - a.gastoPauta;
  });

  const conEconomia = filas.filter((f) => f.tieneEconomia);
  const atribuidas = filas.reduce((s, f) => s + f.comprasAtribuidas, 0);
  const ordenesShopify = ventas._count._all;

  return {
    filas,
    totales: {
      gastoPauta: filas.reduce((s, f) => s + f.gastoPauta, 0),
      ingreso: conEconomia.reduce((s, f) => s + (f.ingreso ?? 0), 0),
      utilidad: conEconomia.reduce((s, f) => s + (f.utilidad ?? 0), 0),
      comprasAtribuidas: atribuidas,
      conEconomia: conEconomia.length,
      sinEconomia: filas.length - conEconomia.length,
    },
    contraste: {
      ordenesShopify,
      facturadoShopify: ventas._sum.netSales ?? 0,
      vecesAtribuido: ordenesShopify > 0 ? atribuidas / ordenesShopify : null,
    },
  };
}
