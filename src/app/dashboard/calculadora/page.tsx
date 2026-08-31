import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManagePipeline } from "@/lib/permissions";
import { fetchProductCatalog, type ShopifyCatalogProduct } from "@/lib/integrations/shopify";
import PricingCalculator, { type CalcProduct } from "./pricing-calculator";
import SinRentabilidad, { type FilaSinRentabilidad } from "./sin-rentabilidad";
import { getRentabilidad } from "@/lib/rentabilidad";
import { recomendar } from "@/lib/recomendaciones";
import { economiaDe } from "@/lib/economia";
import { resolveRange } from "@/lib/date-range";

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
        code: true,
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

  // Los que están perdiendo plata, con qué hacer.
  //
  // Se usa getRentabilidad y no una consulta propia: son los mismos números de
  // la pantalla de Rentabilidad. Si acá dijera otra cosa, habría dos verdades
  // sobre el mismo producto y ninguna forma de saber cuál creer.
  const fichaPorCodigo = new Map(fichas.map((p) => [p.code, p]));

  const rango = resolveRange("30d");
  const rent = await getRentabilidad(session.organizationId, rango);

  const ajustes = await db.calcSetting.findMany({
    where: { organizationId: session.organizationId },
    select: { producto: true, data: true },
  });
  const notaDe = new Map<string, string>();
  for (const a of ajustes) {
    try {
      const d = JSON.parse(a.data) as { recomendacion?: unknown };
      if (typeof d?.recomendacion === "string") notaDe.set(a.producto, d.recomendacion);
    } catch {
      continue;
    }
  }

  const perdiendo: FilaSinRentabilidad[] = rent.filas
    .filter((f) => f.tieneEconomia && f.utilidad != null && f.utilidad < 0)
    .sort((a, b) => (a.utilidad ?? 0) - (b.utilidad ?? 0))
    .map((f) => {
      // El precio, el costo y el flete salen de la ficha del producto: la fila
      // de rentabilidad trae la plata calculada, no los insumos con los que se
      // calculo.
      const ficha = f.code ? fichaPorCodigo.get(f.code) : undefined;
      const eco = ficha
        ? economiaDe({
            salePrice: ficha.salePrice,
            unitCost: ficha.unitCost,
            efectividad: ficha.efectividad,
            devoluciones: ficha.devoluciones,
            flete: ficha.flete,
            gastoAdmPorPedido: null,
          })
        : null;
      return {
        code: f.code,
        name: f.name,
        gastoPauta: f.gastoPauta,
        cpa: f.cpa,
        cpaBreakeven: f.cpaBreakeven ?? 0,
        cpaObjetivo: f.cpaObjetivo ?? 0,
        utilidad: f.utilidad ?? 0,
        precio: ficha?.salePrice ?? 0,
        efectividad: ficha?.efectividad ?? 0,
        devoluciones: ficha?.devoluciones ?? 0,
        recomendaciones: eco ? recomendar(eco, f.cpa, { gastoPauta: f.gastoPauta }) : [],
        nota: notaDe.get(f.name) ?? "",
      };
    });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Calculadora de precios — dropshipping Ecuador</h1>
        <p className="text-sm text-muted">
          Calcula el precio de venta sugerido a partir de costos, comisión de pasarela, IVA y el margen que
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

      <SinRentabilidad filas={perdiendo} periodo={rango.label} />
    </div>
  );
}
