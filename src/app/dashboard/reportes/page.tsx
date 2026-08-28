import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManagePipeline } from "@/lib/permissions";
import { resolveRange } from "@/lib/date-range";
import { getSalesOverview } from "@/lib/sales";
import { getRentabilidad } from "@/lib/rentabilidad";
import { calcularAlertasDiarias } from "@/lib/alertas-diarias";
import ReportsList from "./reports-list";

const money = (n: number, dec = 0) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: dec });

/** Los últimos días, para poder ver la tendencia sin abrir un PDF. */
async function ultimosDias(organizationId: string, cuantos = 14) {
  const hoyEc = new Date(Date.now() - 5 * 3600_000);

  const consultas = Array.from({ length: cuantos }, (_, k) => {
    const i = cuantos - 1 - k;
    const d = new Date(
      Date.UTC(hoyEc.getUTCFullYear(), hoyEc.getUTCMonth(), hoyEc.getUTCDate() - i)
    );
    const iso = d.toISOString().slice(0, 10);
    const rango = resolveRange("personalizado", iso, iso);

    return Promise.all([
      db.shopifyOrder.aggregate({
        where: {
          store: { organizationId },
          occurredAt: { gte: rango.fromInstant, lte: rango.toInstant },
        },
        _count: { _all: true },
        _sum: { netSales: true },
      }),
      db.metricSnapshot.aggregate({
        where: {
          campaign: { adAccount: { organizationId } },
          capturedAt: { gte: rango.from, lte: rango.to },
        },
        _sum: { spend: true },
      }),
    ]).then(([ventas, pauta]) => ({
      dia: iso,
      facturado: ventas._sum.netSales ?? 0,
      ordenes: ventas._count._all,
      gasto: pauta._sum.spend ?? 0,
    }));
  });

  return Promise.all(consultas);
}

export default async function ReportesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManagePipeline(session.role)) redirect("/dashboard");

  const ayer = resolveRange("ayer");

  const [reports, dias, ventasAyer, rentabilidadAyer, alertas] = await Promise.all([
    db.dailyReport.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { date: "desc" },
      take: 60,
      select: { id: true, date: true, createdAt: true },
    }),
    ultimosDias(session.organizationId),
    getSalesOverview(session.organizationId, ayer),
    getRentabilidad(session.organizationId, ayer),
    calcularAlertasDiarias(session.organizationId),
  ]);

  const maxFacturado = Math.max(1, ...dias.map((d) => d.facturado));
  const apagar = alertas.filter((a) => a.tipo === "apagar");
  const escalar = alertas.filter((a) => a.tipo === "escalar");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-semibold">Reportes diarios</h1>
        <p className="mt-0.5 text-sm text-muted">
          Un PDF por día con ventas, pauta, salud de los productos, utilidad y qué hacer al
          respecto. Se genera solo a medianoche de Ecuador y sale por correo.
        </p>
      </div>

      {/* El cierre de ayer, que es de lo que habla el último PDF. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Ayer facturado",
            valor: money(ventasAyer.totalSales),
            nota: `${ventasAyer.ordenes} órdenes`,
            tono: undefined as string | undefined,
          },
          {
            label: "Ticket promedio",
            valor: money(ventasAyer.aov, 2),
            nota: `${ventasAyer.totalSalesChangePct >= 0 ? "+" : ""}${ventasAyer.totalSalesChangePct}% vs. anteayer`,
            tono: undefined,
          },
          {
            label: "Utilidad estimada",
            valor: money(rentabilidadAyer.totales.utilidad),
            nota: "tras mercadería y flete",
            tono: rentabilidadAyer.totales.utilidad >= 0 ? "text-good" : "text-critical",
          },
          {
            label: "Para accionar",
            valor: String(apagar.length + escalar.length),
            nota: `${apagar.length} apagar · ${escalar.length} escalar`,
            tono: apagar.length > 0 ? "text-critical" : undefined,
          },
        ].map((t) => (
          <div key={t.label} className="rounded border border-border bg-surface p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
              {t.label}
            </p>
            <p className={`mt-0.5 text-xl font-semibold tabular-nums ${t.tono ?? ""}`}>{t.valor}</p>
            {t.nota && <p className="text-xs text-muted">{t.nota}</p>}
          </div>
        ))}
      </div>

      {/* Catorce días de un vistazo: la tendencia es lo que un PDF suelto no
          puede mostrar, por más completo que sea. */}
      <div className="rounded border border-border bg-surface p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
          Últimos 14 días · facturado y gasto en pauta
        </p>
        <div className="flex items-end gap-1.5" style={{ height: 124 }}>
          {dias.map((d) => {
            const alto = Math.max(2, (d.facturado / maxFacturado) * 100);
            const altoGasto = Math.min(100, Math.max(1, (d.gasto / maxFacturado) * 100));
            return (
              <div key={d.dia} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="relative flex w-full items-end justify-center"
                  style={{ height: 100 }}
                >
                  <div
                    className="w-full rounded-t bg-accent/85"
                    style={{ height: `${alto}%` }}
                    title={`${d.dia}: ${money(d.facturado)} · ${d.ordenes} órdenes`}
                  />
                  {/* El gasto va como una línea encima de la barra: en dos
                      gráficos separados habría que comparar de memoria. */}
                  <div
                    className="absolute left-0 w-full border-t-2 border-critical/70"
                    style={{ bottom: `${altoGasto}%` }}
                    title={`Pauta: ${money(d.gasto)}`}
                  />
                </div>
                <span className="text-[9px] text-muted">{d.dia.slice(8)}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm bg-accent/85" /> Facturado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 bg-critical/70" /> Gasto en pauta
          </span>
        </div>
      </div>

      {(apagar.length > 0 || escalar.length > 0) && (
        <div className="rounded border border-border bg-surface">
          <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">
            Lo que el reporte dice que hay que hacer
          </p>
          <div className="flex flex-col">
            {[...apagar.slice(0, 4), ...escalar.slice(0, 4)].map((a) => (
              <Link
                key={`${a.tipo}-${a.productId}`}
                href={`/dashboard/productos/${encodeURIComponent(a.code)}`}
                className="flex items-start gap-3 border-b border-border px-4 py-2.5 transition last:border-b-0 hover:bg-surface-2"
              >
                <span
                  className={`mt-px shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                    a.tipo === "apagar"
                      ? "border-critical/30 bg-critical-bg text-critical"
                      : "border-good/30 bg-good-bg text-good"
                  }`}
                >
                  {a.tipo === "apagar" ? "Apagar" : "Escalar"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{a.name}</span>
                  <span className="block text-xs leading-relaxed text-muted">{a.mensaje}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <ReportsList
        initialReports={reports.map((r) => ({
          id: r.id,
          date: r.date.toISOString(),
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
