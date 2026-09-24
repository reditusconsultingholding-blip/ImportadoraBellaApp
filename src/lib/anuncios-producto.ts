import { db } from "@/lib/db";
import { categoriaDeAnuncio } from "@/lib/categoria-anuncio";
import { rangoDe, type PeriodoReporte } from "@/lib/reportes-producto";
import { calcular, economiaDe } from "@/lib/economia";

// Los anuncios de un producto: los de una campaña, o los mejores de todas.
//
// "MEJOR" NO ES "EL DE CPA MÁS BAJO"
// Un anuncio con una sola compra de $1 tiene el mejor CPA del mundo y no dice
// nada. Se ordena primero por si cumple el CPA objetivo del producto con un
// mínimo de compras, después por compras y al final por CPA. Así arriba queda
// lo que de verdad conviene escalar.

export type AnuncioDelProducto = {
  id: string;
  nombre: string;
  grupo: string | null;
  /**
   * El ángulo de venta y el formato, leídos del nombre. Ver categoria-anuncio.ts.
   *
   * Es lo que el equipo quiere medir: "lo que buscamos testear son ángulos de
   * venta; hemos testeado seis y los que funcionan son dos". Sin esto, comparar
   * anuncios solo dice cuál creativo anduvo, no POR QUÉ.
   */
  angulo: string | null;
  formato: string | null;
  /** En qué nombre estaba el ángulo: anuncio, conjunto o campaña. */
  anguloDesde: "anuncio" | "conjunto" | "campana" | null;
  miniaturaUrl: string | null;
  campanaId: string;
  campana: string;
  plataforma: "META" | "TIKTOK";
  gasto: number;
  compras: number;
  ingreso: number;
  impresiones: number;
  clics: number;
  cpa: number | null;
  ctr: number | null;
  cpm: number | null;
  roas: number | null;
  /** Días del período en que gastó. */
  diasActivo: number;
  /** El último día con gasto: si es viejo, el anuncio probablemente está apagado. */
  ultimoDia: string | null;
  veredicto: "escalar" | "bien" | "mirar" | "apagar" | "poco dato";
};

export type AnunciosDelProducto = {
  cpaObjetivo: number | null;
  /**
   * El techo del producto, para ponerlo al lado del objetivo.
   *
   * El veredicto de cada anuncio se sigue midiendo contra el OBJETIVO —es la
   * meta, y con 30% de colchón—, pero quien mira esta tabla decide si apaga o
   * si aguanta, y para eso necesita saber dónde empieza a perder. Fabricio:
   * "es importante que se salga el cpa breackeven para que sepan cuando se
   * esta perdiendo plata".
   *
   * null cuando el producto no tiene cargados precio y costo: ahí no hay
   * equilibrio que calcular, y mostrar un cero sería peor que no mostrar nada.
   */
  cpaEquilibrio: number | null;
  anuncios: AnuncioDelProducto[];
  /** Si todavía no llegó ningún anuncio de Windsor (la primera sincronización). */
  sinDatos: boolean;
};

/** Con cuántas compras un CPA ya dice algo. */
const COMPRAS_MINIMAS = 3;

function veredictoDe(
  a: { gasto: number; compras: number; cpa: number | null },
  objetivo: number | null,
): AnuncioDelProducto["veredicto"] {
  if (objetivo == null || objetivo <= 0) return a.compras >= COMPRAS_MINIMAS ? "bien" : "poco dato";
  if (a.compras === 0) return a.gasto >= objetivo * 2 ? "apagar" : "poco dato";
  if (a.compras < COMPRAS_MINIMAS) return a.cpa! <= objetivo ? "poco dato" : a.gasto >= objetivo * 3 ? "apagar" : "poco dato";
  if (a.cpa! <= objetivo * 0.8) return "escalar";
  if (a.cpa! <= objetivo) return "bien";
  if (a.cpa! <= objetivo * 1.3) return "mirar";
  return "apagar";
}

const PESO: Record<AnuncioDelProducto["veredicto"], number> = { escalar: 0, bien: 1, mirar: 2, "poco dato": 3, apagar: 4 };

export async function anunciosDeProducto(
  organizationId: string,
  code: string,
  periodo: PeriodoReporte,
  campanaId?: string,
): Promise<AnunciosDelProducto | null> {
  const product = await db.product.findFirst({
    where: { organizationId, code },
    select: {
      id: true,
      cpaTarget: true,
      angulosPropios: true,
      // Para el punto de equilibrio. Son los mismos campos que usa la ficha de
      // rentabilidad; la cuenta vive en economia.ts y no se repite acá.
      salePrice: true,
      unitCost: true,
      efectividad: true,
      devoluciones: true,
      flete: true,
      gastoAdmPorPedido: true,
    },
  });
  if (!product) return null;

  const { desdeDia, hastaDia } = rangoDe(periodo);
  const ads = await db.adCreativo.findMany({
    where: {
      campaign: {
        productId: product.id,
        adAccount: { organizationId },
        ...(campanaId ? { id: campanaId } : {}),
      },
    },
    select: {
      id: true,
      nombre: true,
      grupo: true,
      miniaturaUrl: true,
      campaign: { select: { id: true, name: true, adAccount: { select: { platform: true } } } },
      metricas: {
        where: { capturedAt: { gte: desdeDia, lt: hastaDia } },
        select: { capturedAt: true, spend: true, purchases: true, revenue: true, impressions: true, clicks: true },
      },
    },
  });

  const objetivo = product.cpaTarget > 0 ? product.cpaTarget : null;
  const eco = economiaDe(product);
  const equilibrio = eco ? calcular(eco, null).cpaBreakeven : null;
  const anuncios: AnuncioDelProducto[] = ads
    .map((a) => {
      const gasto = a.metricas.reduce((s, m) => s + m.spend, 0);
      const compras = a.metricas.reduce((s, m) => s + m.purchases, 0);
      const ingreso = a.metricas.reduce((s, m) => s + m.revenue, 0);
      const impresiones = a.metricas.reduce((s, m) => s + m.impressions, 0);
      const clics = a.metricas.reduce((s, m) => s + m.clicks, 0);
      const conGasto = a.metricas.filter((m) => m.spend > 0);
      const ultimo = conGasto.reduce<Date | null>((u, m) => (!u || m.capturedAt > u ? m.capturedAt : u), null);
      const cpa = compras > 0 ? gasto / compras : null;
      const categoria = categoriaDeAnuncio(
        { anuncio: a.nombre, conjunto: a.grupo, campana: a.campaign.name },
        product.angulosPropios,
      );
      return {
        id: a.id,
        nombre: a.nombre,
        grupo: a.grupo,
        angulo: categoria.angulo,
        formato: categoria.formato,
        anguloDesde: categoria.desde,
        miniaturaUrl: a.miniaturaUrl,
        campanaId: a.campaign.id,
        campana: a.campaign.name,
        plataforma: a.campaign.adAccount.platform as "META" | "TIKTOK",
        gasto,
        compras,
        ingreso,
        impresiones,
        clics,
        cpa,
        ctr: impresiones > 0 ? clics / impresiones : null,
        cpm: impresiones > 0 ? (gasto / impresiones) * 1000 : null,
        roas: gasto > 0 ? ingreso / gasto : null,
        diasActivo: conGasto.length,
        ultimoDia: ultimo ? ultimo.toISOString().slice(0, 10) : null,
        veredicto: veredictoDe({ gasto, compras, cpa }, objetivo),
      };
    })
    .filter((a) => a.gasto > 0 || a.compras > 0)
    .sort(
      (a, b) =>
        PESO[a.veredicto] - PESO[b.veredicto] ||
        b.compras - a.compras ||
        (a.cpa ?? Infinity) - (b.cpa ?? Infinity) ||
        b.gasto - a.gasto,
    );

  return {
    cpaObjetivo: objetivo,
    cpaEquilibrio: equilibrio != null && equilibrio > 0 ? equilibrio : null,
    anuncios,
    sinDatos: ads.length === 0,
  };
}
