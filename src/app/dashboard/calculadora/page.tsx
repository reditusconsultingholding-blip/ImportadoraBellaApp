import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { getProfitability } from "@/lib/profitability";
import PricingCalculator from "./pricing-calculator";

export default async function CalculadoraPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManagePipeline(session.role)) redirect("/dashboard");

  const { rows } = await getProfitability(session.organizationId);
  const products = rows.map((r) => ({
    name: r.productName,
    cpa: r.cpa,
    operatingExpensePerOrder: r.operatingExpensePerOrder,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Calculadora de precios — dropshipping Ecuador</h1>
        <p className="text-sm text-muted">
          Calculá el precio de venta sugerido a partir de costos, comisión de pasarela, IVA y el margen que
          querés ganar. Podés partir de los datos reales de un producto ya cargado en Rentabilidad.
        </p>
      </div>
      <PricingCalculator products={products} />
    </div>
  );
}
