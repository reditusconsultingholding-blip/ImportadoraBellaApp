import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getOverview } from "@/lib/metrics";
import { getSalesOverview } from "@/lib/sales";
import PlatformTabs from "./platform-tabs";
import StatTile from "./stat-tile";
import SalesOverview from "./sales-overview";
import type { Platform } from "@/generated/prisma/client";

const money = (n: number) =>
  n.toLocaleString("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const platform: Platform = params.platform === "TIKTOK" ? "TIKTOK" : "META";

  const overview = await getOverview(session.organizationId, platform);
  const sales = await getSalesOverview(session.organizationId);

  return (
    <div className="flex flex-col gap-8">
      <SalesOverview data={sales} />

      <div className="flex flex-col gap-6 pt-2 border-t border-border">
        <div className="flex items-center justify-between pt-6">
          <div>
            <h1 className="text-xl font-semibold">Rendimiento de campañas</h1>
            <p className="text-sm text-muted">
              Datos de campañas activas &middot; snapshot más reciente
            </p>
          </div>
          <PlatformTabs active={platform} />
        </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile label="Gasto total" value={money(overview.totalSpend)} />
        <StatTile label="CTR general" value={`${overview.ctr.toFixed(2)}%`} />
        <StatTile label="Compras totales" value={overview.totalPurchases.toString()} />
        <StatTile
          label="Necesitan revisión"
          value={overview.urgentProducts.length.toString()}
          note={overview.urgentProducts.length > 0 ? "CPA por encima del objetivo" : "Todo dentro de rango"}
        />
      </div>

      {overview.topProduct && (
        <div className="bg-surface border border-border rounded p-5 flex items-center justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-muted mb-1">
              Producto que más vende
            </p>
            <p className="text-lg font-semibold">{overview.topProduct.name}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums">{money(overview.topProduct.revenue)}</p>
            <p className="text-xs text-muted">{overview.topProduct.purchases} compras</p>
          </div>
        </div>
      )}

      <div className="bg-surface border border-border rounded overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm">Por producto</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-mono uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Producto</th>
                <th className="px-5 py-3">Compras</th>
                <th className="px-5 py-3">Ventas</th>
                <th className="px-5 py-3">CPA</th>
                <th className="px-5 py-3">Objetivo</th>
                <th className="px-5 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {overview.products.map((p) => (
                <tr key={p.code} className="border-t border-border">
                  <td className="px-5 py-3">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs font-mono text-muted">{p.code}</p>
                  </td>
                  <td className="px-5 py-3 tabular-nums">{p.purchases}</td>
                  <td className="px-5 py-3 tabular-nums">{money(p.revenue)}</td>
                  <td className="px-5 py-3 tabular-nums">
                    {p.cpa !== null ? money(p.cpa) : "—"}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-muted">{money(p.cpaTarget)}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 font-mono text-xs px-2 py-1 rounded ${
                        p.status === "ok"
                          ? "bg-good-bg text-good"
                          : "bg-critical-bg text-critical"
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {p.status === "ok" ? "Bien" : "Urgente"}
                    </span>
                  </td>
                </tr>
              ))}
              {overview.products.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-muted">
                    Sin campañas conectadas todavía para esta plataforma.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}
