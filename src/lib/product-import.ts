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

export async function importarProductosDesdeCampanas(organizationId: string) {
  const campaigns = await db.campaign.findMany({
    where: { adAccount: { organizationId } },
    select: { id: true, name: true, metrics: { select: { spend: true, purchases: true } } },
  });

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
    select: { id: true, code: true, unitCost: true, salePrice: true },
  });
  const porCodigo = new Map(existentes.map((p) => [p.code, p]));

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
            ? `Creado automáticamente desde las campañas (código ${code}). No se encontró en el catálogo de Shopify, así que el CPA objetivo es provisional: revisalo.`
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
