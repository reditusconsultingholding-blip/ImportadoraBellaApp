import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManagePipeline } from "@/lib/permissions";
import { getProfitability } from "@/lib/profitability";
import { fetchProductCatalog, type ShopifyCatalogProduct } from "@/lib/integrations/shopify";
import PricingCalculator, { type CalcProduct } from "./pricing-calculator";

export default async function CalculadoraPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManagePipeline(session.role)) redirect("/dashboard");

  const [{ rows }, store] = await Promise.all([
    getProfitability(session.organizationId),
    db.shopifyStore.findFirst({
      where: { organizationId: session.organizationId, connectedAt: { not: null } },
    }),
  ]);

  // Precio y costo unitario salen de Shopify en vivo cuando la tienda está
  // conectada — es lo que evita tipear el costo de cada producto a mano. Si
  // Shopify falla, la calculadora sigue funcionando con lo de Rentabilidad.
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
    });
  }
  // Las filas vienen ordenadas por mes descendente: la primera aparición de
  // cada producto es la del mes más reciente, y esa es la que vale.
  for (const r of rows) {
    const key = r.productName.trim().toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      if (existing.cpa == null) existing.cpa = r.cpa;
      if (existing.operatingExpensePerOrder == null) {
        existing.operatingExpensePerOrder = r.operatingExpensePerOrder;
      }
      if (existing.price == null && r.revenuePerOrder > 0) existing.price = r.revenuePerOrder;
    } else {
      byName.set(key, {
        name: r.productName,
        price: r.revenuePerOrder > 0 ? r.revenuePerOrder : null,
        unitCost: null,
        cpa: r.cpa,
        operatingExpensePerOrder: r.operatingExpensePerOrder,
      });
    }
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
