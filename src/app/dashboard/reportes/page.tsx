import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManagePipeline } from "@/lib/permissions";
import { rangeToParams, resolveRange, toInputValue } from "@/lib/date-range";
import { getSalesOverview } from "@/lib/sales";
import { getRentabilidad } from "@/lib/rentabilidad";
import { calcularAlertasDiarias, type Alerta } from "@/lib/alertas-diarias";
import { ETIQUETA_CIERRE, proximoCierre } from "@/lib/reporte-horario";
import { serieDelPeriodo } from "@/lib/reporte-serie";
import { nombreDelInforme } from "@/lib/reporte-periodo";
import RangePicker from "../range-picker";
import GraficoPeriodo from "./grafico-periodo";
import DescargarInforme from "./descargar-informe";
import ReportsList from "./reports-list";

const money = (n: number, dec = 0) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: dec });

/** Los tres tipos de recomendación, con el nombre que se usa en pantalla. */
const GRUPOS: { tipo: Alerta["tipo"]; titulo: string; pinta: string }[] = [
  {
    tipo: "apagar",
    titulo: "Apagar o corregir",
    pinta: "border-critical/30 bg-critical-bg text-critical",
  },
  { tipo: "escalar", titulo: "Escalar", pinta: "border-good/30 bg-good-bg text-good" },
  { tipo: "revisar", titulo: "Vigilar", pinta: "border-border bg-pending-bg text-warning" },
];

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string; desde?: string; hasta?: string; platform?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManagePipeline(session.role)) redirect("/dashboard");

  const params = await searchParams;
  // Treinta días por defecto, igual que Rentabilidad: es el período con el que
  // se decide, y así el selector no significa una cosa distinta en cada
  // pantalla.
  const range = resolveRange(params.rango ?? "30d", params.desde, params.hasta);
  const platform = params.platform ?? "META";

  const [reports, serie, ventas, rentabilidad, alertas] = await Promise.all([
    db.dailyReport.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { date: "desc" },
      take: 60,
      select: { id: true, date: true, createdAt: true },
    }),
    serieDelPeriodo(session.organizationId, range),
    getSalesOverview(session.organizationId, range),
    getRentabilidad(session.organizationId, range),
    calcularAlertasDiarias(session.organizationId),
  ]);

  const accionables = alertas.filter((a) => a.tipo !== "revisar").length;
  const cierre = proximoCierre();
  const conteos = GRUPOS.map((g) => ({
    titulo: g.titulo.toLowerCase(),
    n: alertas.filter((a) => a.tipo === g.tipo).length,
  })).filter((c) => c.n > 0);

  return (
    <div className="flex flex-col gap-5">
      {/* El selector va arriba de todo y alcanza a todo lo de abajo: si cada
          bloque tuviera el suyo, dos números de la misma pantalla podrían
          hablar de períodos distintos. Lo único que no depende de él son las
          recomendaciones, y ahí está dicho. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold">Reportes</h1>
          <p className="mt-0.5 text-sm text-muted">
            El reporte diario se genera solo a las {ETIQUETA_CIERRE}, al cerrar el día, y sale por
            correo. El próximo:{" "}
            <span className="whitespace-nowrap">
              {cierre.toLocaleString("es-EC", {
                weekday: "long",
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "America/Guayaquil",
              })}
            </span>
            .
          </p>
        </div>
        <RangePicker
          active={range.id}
          label={range.label}
          from={toInputValue(range.from)}
          to={toInputValue(range.to)}
          platform={platform}
          basePath="/dashboard/reportes"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Facturado",
            valor: money(ventas.totalSales),
            nota: `${ventas.ordenes} órdenes · ${range.label.toLowerCase()}`,
            tono: undefined as string | undefined,
          },
          {
            label: "Ticket promedio",
            valor: money(ventas.aov, 2),
            nota: `${ventas.totalSalesChangePct >= 0 ? "+" : ""}${ventas.totalSalesChangePct}% vs. el período anterior`,
            tono: undefined,
          },
          {
            label: "Utilidad estimada",
            valor: money(rentabilidad.totales.utilidad),
            // Sale de compras ATRIBUIDAS por Meta y TikTok, que suelen ser
            // bastante más que las órdenes reales de Shopify. Decirlo acá evita
            // que se lea como plata en el banco.
            nota: "sobre compras atribuidas, no órdenes reales",
            tono: rentabilidad.totales.utilidad >= 0 ? "text-good" : "text-critical",
          },
          {
            label: "Para accionar",
            valor: String(accionables),
            nota: "ventana fija de 7 días",
            tono: alertas.some((a) => a.tipo === "apagar") ? "text-critical" : undefined,
          },
        ].map((t) => (
          <div key={t.label} className="rounded border border-border bg-surface p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
              {t.label}
            </p>
            <p className={`mt-0.5 text-xl font-semibold ${t.tono ?? ""}`}>{t.valor}</p>
            {t.nota && <p className="text-xs text-muted">{t.nota}</p>}
          </div>
        ))}
      </div>

      <GraficoPeriodo serie={serie} periodo={range.label} />

      <DescargarInforme
        consulta={rangeToParams(range)}
        nombre={nombreDelInforme(range)}
        periodo={range.label}
      />

      {/* Todas las recomendaciones, sin recortar. Antes se mostraban cuatro de
          cada tipo y "Vigilar" no aparecía nunca: con seis productos perdiendo
          plata, el quinto y el sexto no existían para quien miraba la
          pantalla. */}
      <div className="rounded border border-border bg-surface">
        <div className="border-b border-border px-4 py-2.5">
          <p className="text-sm font-semibold">Lo que el reporte dice que hay que hacer</p>
          <p className="text-xs text-muted">
            {alertas.length > 0 && (
              <>
                {alertas.length} en total
                {conteos.map((c) => ` · ${c.n} para ${c.titulo}`).join("")} ·{" "}
              </>
            )}
            se calculan sobre los últimos 7 días contra los 7 anteriores, así que no cambian con el
            período de arriba
          </p>
        </div>

        {alertas.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            Ningún producto con pauta suficiente quedó fuera de su punto de equilibrio.
          </p>
        ) : (
          <div className="flex flex-col">
            {GRUPOS.flatMap((g) =>
              alertas
                .filter((a) => a.tipo === g.tipo)
                .map((a) => (
                  <Link
                    key={`${a.tipo}-${a.productId}`}
                    href={`/dashboard/productos/${encodeURIComponent(a.code)}`}
                    className="flex items-start gap-3 border-b border-border px-4 py-2.5 transition last:border-b-0 hover:bg-surface-2"
                  >
                    <span
                      className={`mt-px shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${g.pinta}`}
                    >
                      {g.titulo}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{a.name}</span>
                      <span className="block text-xs leading-relaxed text-muted">{a.mensaje}</span>
                    </span>
                  </Link>
                ))
            )}
          </div>
        )}
      </div>

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
