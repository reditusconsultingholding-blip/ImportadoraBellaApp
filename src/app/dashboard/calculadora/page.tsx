import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManagePipeline } from "@/lib/permissions";
import { fetchProductCatalog, type ShopifyCatalogProduct } from "@/lib/integrations/shopify";
import PricingCalculator, { type CalcProduct } from "./pricing-calculator";

export default async function CalculadoraPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManagePipeline(session.role)) redirect("/dashboard");

  const [fichas, store] = await Promise.all([
    // La economía real de cada producto, que es lo que el equipo lleva en su
    // planilla. Antes esto salía de ProductProfitability, una tabla que nunca
    // llenó nadie: la calculadora arrancaba siempre con los valores por
    // defecto y parecía que no sabía nada de los productos.
    db.product.findMany({
      where: { organizationId: session.organizationId, archived: false },
      select: {
        name: true,
        salePrice: true,
        unitCost: true,
        flete: true,
        efectividad: true,
        devoluciones: true,
        cpaTarget: true,
      },
    }),
    db.shopifyStore.findFirst({
      where: { organizationId: session.organizationId, connectedAt: { not: null } },
    }),
  ]);

  // El catálogo de Shopify aporta precio y costo de los productos que todavía
  // no tienen ficha propia.
  let catalog: ShopifyCatalogProduct[] = [];
  let catalogError = false;
  if (store) {
    try {
      catalog = await fetchProductCatalog(store.shopDomain, store.accessToken);
    } catch {
      catalogError = true;
    }
  }

  const byName = new Map<string, CalcProduct>();
  for (const c of catalog) {
    byName.set(c.title.trim().toLowerCase(), {
      name: c.title,
      price: c.price,
      unitCost: c.unitCost,
      cpa: null,
      operatingExpensePerOrder: null,
      flete: null,
      efectividad: null,
      devoluciones: null,
    });
  }

  // La ficha le gana al catálogo: si alguien cargó el costo real o la
  // efectividad, ese dato vale más que el de la tienda.
  for (const p of fichas) {
    byName.set(p.name.trim().toLowerCase(), {
      name: p.name,
      price: p.salePrice,
      unitCost: p.unitCost,
      cpa: p.cpaTarget > 0 ? p.cpaTarget : null,
      operatingExpensePerOrder: null,
      flete: p.flete,
      efectividad: p.efectividad,
      devoluciones: p.devoluciones,
    });
  }
  const products = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, "es"));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Calculadora de precios — dropshipping Ecuador</h1>
        <p className="text-sm text-muted">
          Calculá el precio de venta sugerido a partir de costos, comisión de pasarela, IVA y el margen que
          quieres ganar — y mira abajo qué pasa con ese precio una vez que se descuentan los pedidos que no se
          confirman y los que se devuelven.
        </p>
        {catalog.length > 0 && (
          <p className="text-xs text-muted mt-1">
            {catalog.length} productos con precio y costo traídos de Shopify en vivo.
          </p>
        )}
        {catalogError && (
          <p className="text-xs text-accent-strong mt-1">
            No se pudo leer el catálogo de Shopify — los productos de abajo salen solo de Rentabilidad.
          </p>
        )}
      </div>
      <PricingCalculator products={products} />
    </div>
  );
}
