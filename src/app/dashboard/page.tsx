import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getOverview } from "@/lib/metrics";
import { getSalesOverview } from "@/lib/sales";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import { resolveRange } from "@/lib/date-range";
import PlatformTabs from "./platform-tabs";
import StatTile from "./stat-tile";
import SalesOverview from "./sales-overview";
import RangePicker from "./range-picker";
import PulsePanel from "./pulse-panel";
import CatalogPicker from "./catalog-picker";
import type { Platform } from "@/generated/prisma/client";

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const money2 = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; rango?: string; desde?: string; hasta?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const platform: Platform = params.platform === "TIKTOK" ? "TIKTOK" : "META";
  const range = resolveRange(params.rango, params.desde, params.hasta);

  const [overview, sales] = await Promise.all([
    getOverview(session.organizationId, platform, range),
    getSalesOverview(session.organizationId),
  ]);

  const query =
    range.id === "personalizado"
      ? `rango=personalizado&desde=${isoDay(range.from)}&hasta=${isoDay(range.to)}`
      : `rango=${range.id}`;

  return (
    <div className="flex flex-col gap-6">
      <SalesOverview data={sales} />

      {canManagePipeline(session.role) && <PulsePanel query={query} />}

      {canManagePipeline(session.role) && <CatalogPicker />}

      <div className="flex flex-col gap-5 border-t border-border pt-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-[22px] font-semibold">Rendimiento de campañas</h1>
              <p className="text-sm text-muted mt-0.5">{range.label}</p>
            </div>
            <PlatformTabs active={platform} />
          </div>
          <RangePicker
            active={range.id}
            label={range.label}
            from={isoDay(range.from)}
            to={isoDay(range.to)}
            platform={platform}
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Gasto total" value={money(overview.totalSpend)} />
          <StatTile label="Compras atribuidas" value={overview.totalPurchases.toLocaleString("es-EC")} />
          <StatTile
            label="ROAS"
            value={overview.roas !== null ? overview.roas.toFixed(2) : "—"}
            note="ingreso atribuido ÷ gasto"
            tone={overview.roas !== null && overview.roas >= 1 ? "good" : overview.roas !== null ? "bad" : "neutral"}
          />
          <StatTile
            label="Necesitan revisión"
            value={overview.urgentRows.length.toString()}
            note={
              overview.urgentRows.length > 0
                ? "CPA por encima del objetivo"
                : "Todo dentro de rango"
            }
            tone={overview.urgentRows.length > 0 ? "bad" : "neutral"}
          />
        </div>

        {overview.campaignsWithoutProduct > 0 && (
          <p className="rounded border border-border bg-pending-bg px-3 py-2 text-xs text-warning">
            {overview.campaignsWithoutProduct} campañas todavía no están asociadas a un producto, así
            que se muestran sueltas y sin semáforo de CPA. Cargá los productos en{" "}
            <Link href="/dashboard/productos" className="underline">
              Productos
            </Link>{" "}
            y se enlazan solas por el nombre de la campaña.
          </p>
        )}

        <div className="bg-surface border border-border rounded overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h2 className="font-semibold text-sm">Por producto y campaña</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="table-cols w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="px-5 py-3">Producto / campaña</th>
                  <th className="px-5 py-3 text-right">Gasto</th>
                  <th className="px-5 py-3 text-right">Compras</th>
                  <th className="px-5 py-3 text-right">Ingreso</th>
                  <th className="px-5 py-3 text-right">CPA</th>
                  <th className="px-5 py-3 text-right">Objetivo</th>
                  <th className="px-5 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {overview.rows.map((r) => (
                  <tr key={r.key} className="border-t border-border">
                    <td className="px-5 py-3">
                      {r.code && canAccessPipeline(session.role) ? (
                        <Link
                          href={`/dashboard/productos/${r.code}`}
                          className="font-medium hover:text-accent hover:underline"
                        >
                          {r.name}
                        </Link>
                      ) : (
                        <p className="font-medium leading-snug">{r.name}</p>
                      )}
                      {r.code && <p className="text-xs font-mono text-muted">{r.code}</p>}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{money2(r.spend)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{r.purchases}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{money2(r.revenue)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {r.cpa !== null ? money2(r.cpa) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted">
                      {r.cpaTarget !== null ? money2(r.cpaTarget) : "—"}
                    </td>
                    <td className="px-5 py-3">
                      {r.status === "sin-objetivo" ? (
                        <span className="text-xs text-muted whitespace-nowrap">sin producto</span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded whitespace-nowrap ${
                            r.status === "ok" ? "bg-good-bg text-good" : "bg-critical-bg text-critical"
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {r.status === "ok" ? "Bien" : "Urgente"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {overview.rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-muted">
                      Sin datos de campañas para este período y esta plataforma.
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
