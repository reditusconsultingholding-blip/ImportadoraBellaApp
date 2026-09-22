import { db } from "@/lib/db";
import { calcular, economiaDe } from "@/lib/economia";
import { ventasRealesPorProducto } from "@/lib/enlace-shopify";
import { resumenSinProducto } from "@/lib/sin-nomenclatura";
import type { Range } from "@/lib/date-range";
import { memorizar } from "@/lib/memoria";

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
  /** El ID del producto en Dropi: se busca y se copia por él. */
  sku: string | null;
  name: string;

  gastoPauta: number;
  comprasAtribuidas: number;
  cpa: number | null;
  /**
   * El CPA del período inmediatamente anterior, del mismo largo.
   *
   * Con "Hoy" elegido arriba, es el CPA de ayer. Es la pregunta que se hace
   * antes de tocar un presupuesto —"¿cuánto me costaba ayer?"— y sin ella un
   * CPA suelto no dice si viene subiendo o bajando, que es lo que decide.
   */
  cpaAnterior: number | null;
  /** Si al menos una de sus campañas está encendida en Meta o TikTok. */
  enMarcha: boolean;

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

  /**
   * Lo mismo, pero sobre lo que la tienda vendió DE VERDAD.
   *
   * null cuando el producto todavía no está enlazado con su nombre de Shopify
   * (Producción · Sin nomenclatura). Se deja en null y no en cero a propósito:
   * cero se lee como "no vendió nada", y lo que pasa es que no sabemos.
   */
  real: RealDeFila | null;
};

export type RealDeFila = {
  /** Unidades PEDIDAS en la tienda. */
  unidades: number;
  /** Lo que la tienda facturó por ellas, con sus descuentos y sus packs. */
  facturado: number;
  /** Las que llegan a cobrarse, después de efectividad y devoluciones. */
  entregadas: number;
  ingreso: number;
  costoMercaderia: number;
  costoFlete: number;
  /** Ingreso menos mercadería, flete y la pauta del producto. */
  utilidad: number;
  margen: number | null;
};

// El semáforo vive en un módulo sin dependencias de la base, para que la
// tabla —que corre en el navegador— pueda usarlo. Se reexporta acá para que
// el resto del servidor lo encuentre donde espera.
export { semaforoDeFila, type Semaforo } from "@/lib/rentabilidad-semaforo";

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
   * El mismo resumen sobre la venta real de la tienda.
   *
   * Es el que se muestra arriba cuando hay enlaces cargados: al lado de
   * "facturado en Shopify", un ingreso calculado sobre el 17% de las órdenes se
   * lee como si la herramienta estuviera rota.
   */
  totalesReales: {
    productos: number;
    unidades: number;
    facturado: number;
    ingreso: number;
    utilidad: number;
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
    /** Qué parte de lo facturado está enlazada a un producto. 0 a 1. */
    coberturaEnlaces: number;
    /**
     * Gasto de campañas que no cuelgan de ningún producto, en el mismo período.
     *
     * Existe porque `totales.gastoPauta` solo suma lo que se le puede imputar a
     * un producto, y esa resta era invisible: quien miraba la pantalla veía un
     * gasto menor que el que reportan Meta y TikTok y no tenía cómo saber por
     * qué. Sumados, los dos dan el gasto completo del período.
     */
    gastoSinAsignar: number;
    /** Compras que esas campañas se atribuyen y no le suman a ningún producto. */
    comprasSinAsignar: number;
  };
};

/**
 * Gasto y compras por producto en el período anterior, del mismo largo.
 *
 * Se resuelve con una agregación propia en vez de traer otra vez el catálogo
 * con sus campañas: lo único que hace falta son dos sumas por producto, y
 * bajar los ciento dieciocho productos por segunda vez para eso sería pagar la
 * consulta cara para responder una barata.
 */
async function gastoDelPeriodoAnterior(organizationId: string, range: Range) {
  const largo = range.to.getTime() - range.from.getTime();
  const hasta = new Date(range.from.getTime() - 1);
  const desde = new Date(range.from.getTime() - largo - 1);

  const filas = await db.$queryRaw<{ productId: string; gasto: number; compras: number }[]>`
    SELECT c."productId"                       AS "productId",
           coalesce(sum(m.spend), 0)::float8   AS gasto,
           coalesce(sum(m.purchases), 0)::int  AS compras
    FROM "MetricSnapshot" m
    JOIN "Campaign" c  ON c.id = m."campaignId"
    JOIN "AdAccount" a ON a.id = c."adAccountId"
    WHERE a."organizationId" = ${organizationId}
      AND c."productId" IS NOT NULL
      AND m."capturedAt" >= ${desde}
      AND m."capturedAt" <= ${hasta}
    GROUP BY c."productId"
  `;

  const porProducto = new Map<string, { gasto: number; compras: number }>();
  for (const f of filas) {
    porProducto.set(f.productId, { gasto: Number(f.gasto) || 0, compras: Number(f.compras) || 0 });
  }
  return porProducto;
}

async function getRentabilidadSinMemoria(
  organizationId: string,
  range: Range
): Promise<Rentabilidad> {
  const [productos, ventas, reales, sueltas, antes] = await Promise.all([
    db.product.findMany({
      where: { organizationId, archived: false },
      select: {
        id: true,
        code: true,
        sku: true,
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
            status: true,
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
    // Lo que la tienda vendió de cada producto, para los que ya están
    // enlazados con su nombre de Shopify.
    ventasRealesPorProducto(organizationId, range),
    // El gasto que no le cuelga a nadie. Se pide acá para que la pantalla
    // pueda mostrar el gasto COMPLETO del período —asignado más suelto— en vez
    // de solo el asignado, que es menor que el de Meta y TikTok y hacía dudar
    // de toda la tabla.
    resumenSinProducto(organizationId, range),
    // El mismo gasto y las mismas compras, pero del período anterior de igual
    // largo: con "Hoy" arriba, esto es ayer. Va por producto para poder decir
    // si el costo por venta de cada uno viene subiendo o bajando.
    gastoDelPeriodoAnterior(organizationId, range),
  ]);

  const filas: FilaRentabilidad[] = [];

  for (const p of productos) {
    let gastoPauta = 0;
    let comprasAtribuidas = 0;
    // Basta con que UNA campaña esté encendida para que el producto cuente
    // como en marcha: apagar una de ocho no lo saca de la pauta.
    let enMarcha = false;
    for (const c of p.campaigns) {
      if (c.status === "ACTIVE") enMarcha = true;
      for (const m of c.metrics) {
        gastoPauta += m.spend;
        comprasAtribuidas += m.purchases;
      }
    }
    const venta = reales.get(p.id) ?? null;

    // Antes se saltaba todo lo que no tuviera pauta. Con la venta real en la
    // mano eso escondía justo los productos que venden solos: sin un dólar de
    // anuncios pero facturando, que son los que más margen dejan.
    if (gastoPauta <= 0 && comprasAtribuidas <= 0 && (venta == null || venta.unidades <= 0)) {
      continue;
    }

    const cpa = comprasAtribuidas > 0 ? gastoPauta / comprasAtribuidas : null;
    const previo = antes.get(p.id);
    const cpaAnterior = previo && previo.compras > 0 ? previo.gasto / previo.compras : null;
    const economia = economiaDe(p);

    if (!economia || p.efectividad == null) {
      filas.push({
        productId: p.id,
        code: p.code,
        sku: p.sku,
        name: p.name,
        gastoPauta,
        comprasAtribuidas,
        cpa,
        cpaAnterior,
        enMarcha,
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
        // Sin economía no hay utilidad que calcular, pero lo vendido sí se
        // sabe: se muestra para que se vea qué se está dejando de medir por no
        // cargar cuatro datos.
        real:
          venta == null
            ? null
            : {
                unidades: venta.unidades,
                facturado: venta.facturado,
                entregadas: 0,
                ingreso: 0,
                costoMercaderia: 0,
                costoFlete: 0,
                utilidad: 0,
                margen: null,
              },
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

    // La misma cuenta, con las unidades que la tienda vendió de verdad en
    // lugar de las compras que la pauta se cuelga.
    //
    // El precio sale de dividir lo facturado entre las unidades y no de la
    // ficha: la ficha guarda el precio de lista, y lo que entró lleva adentro
    // los descuentos y los packs. Usar el de lista inflaría el ingreso de todo
    // producto que se venda en oferta, que en esta tienda son casi todos.
    const real: RealDeFila | null =
      venta == null || venta.unidades <= 0
        ? null
        : (() => {
            const precioReal = venta.facturado / venta.unidades;
            const entregadas = venta.unidades * cuentas.entregados;
            const ingresoReal = entregadas * precioReal;
            const mercaderiaReal = entregadas * economia.costo;
            const fleteReal = venta.unidades * economia.efectividad * economia.flete;
            const utilidadReal = ingresoReal - mercaderiaReal - fleteReal - gastoPauta;
            return {
              unidades: venta.unidades,
              facturado: venta.facturado,
              entregadas,
              ingreso: ingresoReal,
              costoMercaderia: mercaderiaReal,
              costoFlete: fleteReal,
              utilidad: utilidadReal,
              margen: ingresoReal > 0 ? utilidadReal / ingresoReal : null,
            };
          })();

    filas.push({
      productId: p.id,
      code: p.code,
      sku: p.sku,
      name: p.name,
      gastoPauta,
      comprasAtribuidas,
      cpa,
      cpaAnterior,
      enMarcha,
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
      real,
    });
  }

  // Primero lo que más plata pierde, después lo que más gana. Lo urgente
  // arriba, y lo bueno también a la vista para saber dónde escalar.
  // Se ordena por la utilidad real cuando la hay: es la que decide, y si la
  // tabla se ordenara por la atribuida, el producto que más plata pierde de
  // verdad podría quedar en la fila cuarenta.
  filas.sort((a, b) => {
    const ua = a.real?.utilidad ?? a.utilidad ?? 0;
    const ub = b.real?.utilidad ?? b.utilidad ?? 0;
    if (ua < 0 && ub >= 0) return -1;
    if (ub < 0 && ua >= 0) return 1;
    if (ua < 0 && ub < 0) return ua - ub;
    return b.gastoPauta - a.gastoPauta;
  });

  const conEconomia = filas.filter((f) => f.tieneEconomia);
  const conReal = filas.filter((f) => f.real != null && f.tieneEconomia);
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
    totalesReales: {
      productos: conReal.length,
      unidades: conReal.reduce((s, f) => s + (f.real?.unidades ?? 0), 0),
      facturado: filas.reduce((s, f) => s + (f.real?.facturado ?? 0), 0),
      ingreso: conReal.reduce((s, f) => s + (f.real?.ingreso ?? 0), 0),
      utilidad: conReal.reduce((s, f) => s + (f.real?.utilidad ?? 0), 0),
    },
    contraste: {
      ordenesShopify,
      facturadoShopify: ventas._sum.netSales ?? 0,
      vecesAtribuido: ordenesShopify > 0 ? atribuidas / ordenesShopify : null,
      coberturaEnlaces:
        (ventas._sum.netSales ?? 0) > 0
          ? filas.reduce((s, f) => s + (f.real?.facturado ?? 0), 0) / (ventas._sum.netSales ?? 1)
          : 0,
      gastoSinAsignar: sueltas.gasto,
      comprasSinAsignar: sueltas.compras,
    },
  };
}

// Cálculos pesados compartidos hasta la próxima escritura en la base.
// Ver src/lib/memoria.ts.
export const getRentabilidad = memorizar("rentabilidad.getRentabilidad", getRentabilidadSinMemoria);
