import { db } from "@/lib/db";
import { fetchProductCatalog } from "@/lib/integrations/shopify";
import { parseCampaignRef, nombreCanonico, buscarEnCatalogo } from "@/lib/product-code";

// Crea la ficha de producto de todo lo que se está pauteando, sacándola de los
// nombres de campaña (ver product-code.ts) y completándola con el precio y el
// costo reales del catálogo de Shopify.
//
// Es lo que hace posible medir rentabilidad: sin costo unitario, "ROAS 20" no
// dice si el producto gana o pierde plata.

/**
 * Umbral de CPA con el que arranca cada producto.
 *
 * Si se conocen precio y costo, el número sale de la economía del producto: el
 * margen bruto es lo máximo que se puede pagar por una venta antes de perder
 * plata, y se deja el 30% de colchón para envío, devoluciones y estructura.
 *
 * Si no se conocen, no se inventa un número: se usa el CPA que el producto ya
 * tiene y se anota que es provisional, para que nadie lea un semáforo verde
 * como si significara algo.
 */
function calcularCpaTarget(
  precio: number | null,
  costo: number | null,
  cpaObservado: number | null
): { valor: number; provisional: boolean } {
  if (precio != null && costo != null && precio > costo) {
    return { valor: Math.round((precio - costo) * 0.7 * 100) / 100, provisional: false };
  }
  if (precio != null && precio > 0) {
    return { valor: Math.round(precio * 0.35 * 100) / 100, provisional: false };
  }
  if (cpaObservado != null && cpaObservado > 0) {
    return { valor: Math.round(cpaObservado * 100) / 100, provisional: true };
  }
  return { valor: 10, provisional: true };
}

/**
 * Los códigos de campaña que todavía no tienen ficha.
 *
 * Es la consulta liviana que corre el reloj cada hora (Fabrizio y Emilia,
 * 10-nov: «que los productos nuevos se carguen solos»; Emilia tuvo que crear
 * varios a mano). Solo lee nombres de campaña y códigos: si no hay nada nuevo,
 * no se toca Shopify ni las métricas.
 */
export async function codigosSinFicha(organizationId: string): Promise<string[]> {
  const [campanas, productos] = await Promise.all([
    db.campaign.findMany({ where: { adAccount: { organizationId } }, select: { name: true } }),
    db.product.findMany({ where: { organizationId }, select: { code: true, codigosAnteriores: true } }),
  ]);
  const conocidos = new Set(productos.flatMap((p) => [p.code, ...p.codigosAnteriores]));
  const nuevos = new Set<string>();
  for (const c of campanas) {
    const ref = parseCampaignRef(c.name);
    if (ref && !conocidos.has(ref.code)) nuevos.add(ref.code);
  }
  return [...nuevos];
}

/**
 * Crea solo las fichas que faltan. Lo llama el reloj: con nada nuevo, cuesta
 * dos consultas chicas.
 */
export async function crearProductosNuevos(organizationId: string) {
  const nuevos = await codigosSinFicha(organizationId);
  if (nuevos.length === 0) return null;
  return importarProductosDesdeCampanas(organizationId, new Set(nuevos));
}

export async function importarProductosDesdeCampanas(organizationId: string, soloCodigos?: Set<string>) {
  const todas = await db.campaign.findMany({
    where: { adAccount: { organizationId } },
    select: { id: true, name: true },
  });
  // Con una lista de códigos, las métricas se leen solo de esas campañas: la
  // historia de todas es lo que más pesa de esta función.
  const elegidas = soloCodigos
    ? todas.filter((c) => {
        const ref = parseCampaignRef(c.name);
        return ref != null && soloCodigos.has(ref.code);
      })
    : todas;
  const metricas = await db.metricSnapshot.groupBy({
    by: ["campaignId"],
    where: { campaignId: { in: elegidas.map((c) => c.id) } },
    _sum: { spend: true, purchases: true },
  });
  const sumaDe = new Map(metricas.map((m) => [m.campaignId, m._sum]));
  const campaigns = elegidas.map((c) => ({
    ...c,
    metrics: [{ spend: sumaDe.get(c.id)?.spend ?? 0, purchases: sumaDe.get(c.id)?.purchases ?? 0 }],
  }));

  // Un grupo por código: todos los nombres con que apareció y lo que lleva
  // gastado y vendido, para poder estimar su CPA actual.
  const grupos = new Map<
    string,
    { nombres: string[]; gasto: number; compras: number; campanas: number }
  >();

  for (const c of campaigns) {
    const ref = parseCampaignRef(c.name);
    if (!ref) continue;
    const g = grupos.get(ref.code) ?? { nombres: [], gasto: 0, compras: 0, campanas: 0 };
    g.nombres.push(ref.name);
    g.campanas += 1;
    for (const s of c.metrics) {
      g.gasto += s.spend;
      g.compras += s.purchases;
    }
    grupos.set(ref.code, g);
  }

  if (grupos.size === 0) {
    return { detectados: 0, creados: 0, actualizados: 0, conCatalogo: 0 };
  }

  // Si Shopify falla no se aborta: se crean igual las fichas sin precio, que
  // es mejor que no tener nada. Se refleja en conCatalogo.
  let catalogo: { title: string; price: number | null; unitCost: number | null }[] = [];
  const store = await db.shopifyStore.findFirst({
    where: { organizationId, connectedAt: { not: null } },
  });
  if (store) {
    try {
      catalogo = await fetchProductCatalog(store.shopDomain, store.accessToken);
    } catch {
      catalogo = [];
    }
  }

  const existentes = await db.product.findMany({
    where: { organizationId },
    select: { id: true, code: true, codigosAnteriores: true, unitCost: true, salePrice: true },
  });
  // Los códigos anteriores también cuentan como "ya existe": si no, la primera
  // campaña vieja que apareciera volvería a crear el producto duplicado que se
  // fusionó a propósito.
  const porCodigo = new Map(
    existentes.flatMap((p) => [p.code, ...p.codigosAnteriores].map((c) => [c, p] as const)),
  );

  let creados = 0;
  let actualizados = 0;
  let conCatalogo = 0;

  for (const [code, g] of grupos) {
    const name = nombreCanonico(g.nombres);
    const enShopify = buscarEnCatalogo(name, catalogo);
    if (enShopify) conCatalogo += 1;

    const precio = enShopify?.price ?? null;
    const costo = enShopify?.unitCost ?? null;
    const cpaObservado = g.compras > 0 ? g.gasto / g.compras : null;
    const { valor: cpaTarget, provisional } = calcularCpaTarget(precio, costo, cpaObservado);

    const ya = porCodigo.get(code);
    if (!ya) {
      await db.product.create({
        data: {
          organizationId,
          code,
          name,
          cpaTarget,
          unitCost: costo,
          salePrice: precio,
          notes: provisional
            ? `Creado automáticamente desde las campañas (código ${code}). No se encontró en el catálogo de Shopify, así que el CPA objetivo es provisional: revísalo.`
            : `Creado automáticamente desde las campañas (código ${code}). Precio y costo salen del catálogo de Shopify: "${enShopify?.title}".`,
        },
      });
      creados += 1;
      continue;
    }

    // Sobre una ficha que ya existe solo se completan los huecos: si alguien
    // cargó el costo a mano, ese dato le gana al del catálogo.
    const parche: { unitCost?: number; salePrice?: number } = {};
    if (ya.unitCost == null && costo != null) parche.unitCost = costo;
    if (ya.salePrice == null && precio != null) parche.salePrice = precio;
    if (Object.keys(parche).length > 0) {
      await db.product.update({ where: { id: ya.id }, data: parche });
      actualizados += 1;
    }
  }

  return { detectados: grupos.size, creados, actualizados, conCatalogo };
}
