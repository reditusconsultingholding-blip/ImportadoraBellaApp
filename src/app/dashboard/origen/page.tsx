import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { resolveRange } from "@/lib/date-range";
import { reporteDeOrigen } from "@/lib/origen-ventas";
import RangePicker from "../range-picker";
import { EncabezadoSeccion, InsigniaEncabezado } from "../encabezado-seccion";

// "¿De dónde salieron estas ventas que la pauta no explica?"
//
// Es la pantalla que contesta esa pregunta orden por orden, con lo que Shopify
// guarda del recorrido de cada comprador. Ver src/lib/origen-ventas.ts.

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const money2 = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 2 });
const hora = (d: Date) =>
  d.toLocaleString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const TONO: Record<string, string> = {
  Meta: "bg-accent",
  TikTok: "bg-brand-navy",
  Google: "bg-chart-2",
  WhatsApp: "bg-good",
  "Otra red social": "bg-chart-3",
  Correo: "bg-chart-4",
  "Directo o link compartido": "bg-warning",
  "Otra fuente": "bg-border-strong",
  "Sin dato": "bg-muted",
};

export default async function OrigenPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string; desde?: string; hasta?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManagePipeline(session.role)) redirect("/dashboard");
  const verCifras = await veLasCifras(session.userId);

  const params = await searchParams;
  const range = resolveRange(params.rango ?? "hoy", params.desde, params.hasta);
  const r = await reporteDeOrigen(session.organizationId, range);

  const sinRecorrido = r.ordenes - r.conDato;
  const pct = (n: number) => (r.ordenes > 0 ? Math.round((n / r.ordenes) * 100) : 0);

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoSeccion
        eyebrow="Números"
        titulo="Origen de las ventas"
        insignia={<InsigniaEncabezado>{range.label}</InsigniaEncabezado>}
        descripcion="De dónde llegó cada comprador, según el recorrido que guarda Shopify: con qué enlace entró, quién lo refirió y en qué página cayó. Es lo que explica las ventas que la pauta no se atribuye."
        acciones={
          <RangePicker
            active={range.id}
            label={range.label}
            from={isoDay(range.from)}
            to={isoDay(range.to)}
            platform="META"
            basePath="/dashboard/origen"
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Ventas del período", valor: r.ordenes.toLocaleString("es-EC"), nota: verCifras ? money(r.monto) : undefined },
          { label: "Con recorrido guardado", valor: `${r.conDato.toLocaleString("es-EC")}`, nota: `${pct(r.conDato)}% del total` },
          { label: "Que la pauta no explica", valor: r.sinPauta.length.toLocaleString("es-EC"), nota: `${pct(r.sinPauta.length)}% del total` },
          { label: "Clientes que ya habían comprado", valor: r.recompras.toLocaleString("es-EC"), nota: `${pct(r.recompras)}% del total` },
        ].map((t) => (
          <div key={t.label} className="rounded border border-border bg-surface p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{t.valor}</p>
            {t.nota && <p className="text-xs text-muted">{t.nota}</p>}
          </div>
        ))}
      </div>

      <section className="rounded border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">Por dónde entraron</h2>
        <div className="mt-3 flex flex-col gap-2">
          {r.porCategoria.map((c) => (
            <div key={c.categoria} className="flex items-center gap-3">
              <span className="w-52 shrink-0 text-sm text-foreground">{c.categoria}</span>
              <span className="h-2 grow overflow-hidden rounded-full bg-surface-2">
                <span
                  className={`block h-full rounded-full ${TONO[c.categoria] ?? "bg-border-strong"}`}
                  style={{ width: `${pct(c.ordenes)}%` }}
                />
              </span>
              <span className="w-28 shrink-0 text-right text-sm tabular-nums text-foreground">
                {c.ordenes.toLocaleString("es-EC")} <span className="text-muted">({pct(c.ordenes)}%)</span>
              </span>
              {verCifras && <span className="w-24 shrink-0 text-right text-sm tabular-nums text-muted">{money(c.monto)}</span>}
            </div>
          ))}
          {r.porCategoria.length === 0 && <p className="text-sm text-muted">No hubo ventas en el período.</p>}
        </div>
        {sinRecorrido > 0 && (
          <p className="mt-4 text-xs leading-relaxed text-muted">
            {sinRecorrido.toLocaleString("es-EC")} {sinRecorrido === 1 ? "orden no tiene" : "órdenes no tienen"} recorrido
            guardado. Shopify solo lo registra cuando la visita quedó anotada (cookies aceptadas, sin bloqueadores). No se
            reparten a ojo: quedan como «Sin dato».
          </p>
        )}
      </section>

      {r.campanasDesconocidas.length > 0 && (
        <section className="rounded border border-warning/40 bg-pending-bg p-5">
          <h2 className="text-sm font-semibold text-foreground">Campañas que Jarvis no conoce</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Estos enlaces traen el nombre de una campaña que no existe en ninguna cuenta conectada. Suele significar una
            cuenta publicitaria sin conectar en Windsor, o un enlace armado a mano.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {r.campanasDesconocidas.slice(0, 12).map((c) => (
              <li key={c.campana} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-mono text-[12px] text-foreground">{c.campana}</span>
                <span className="shrink-0 tabular-nums text-muted">
                  {c.ordenes} {c.ordenes === 1 ? "venta" : "ventas"}
                  {verCifras ? ` · ${money(c.monto)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded border border-border bg-surface">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            Las {r.sinPauta.length.toLocaleString("es-EC")} que la pauta no explica
          </h2>
          <p className="mt-0.5 text-xs text-muted">Orden por orden, con la pista que dejó cada una.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-5 py-2 font-medium">Cuándo</th>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 font-medium">Origen</th>
                <th className="px-3 py-2 font-medium">Pista</th>
                {verCifras && <th className="px-5 py-2 text-right font-medium">Monto</th>}
              </tr>
            </thead>
            <tbody>
              {r.sinPauta.slice(0, 300).map((o) => (
                <tr key={o.externalId} className="border-b border-border/60 last:border-0">
                  <td className="whitespace-nowrap px-5 py-2 tabular-nums text-muted">{hora(o.momento)}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-foreground">{o.producto ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className="text-foreground">{o.categoria}</span>
                    {o.recompra && <span className="ml-1.5 text-[11px] text-muted">· ya había comprado</span>}
                  </td>
                  <td className="max-w-[320px] truncate px-3 py-2 font-mono text-[11px] text-muted">
                    {o.campana ? `${o.campana}${o.campanaDesconocida ? " (no está en Jarvis)" : ""}` : (o.pista ?? "sin pista")}
                  </td>
                  {verCifras && <td className="px-5 py-2 text-right tabular-nums text-foreground">{money2(o.monto)}</td>}
                </tr>
              ))}
              {r.sinPauta.length === 0 && (
                <tr>
                  <td colSpan={verCifras ? 5 : 4} className="px-5 py-6 text-center text-sm text-muted">
                    Todas las ventas del período vinieron de Meta o TikTok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {r.sinPauta.length > 300 && (
          <p className="border-t border-border px-5 py-2 text-xs text-muted">
            Se muestran las 300 más recientes de {r.sinPauta.length.toLocaleString("es-EC")}.
          </p>
        )}
      </section>
    </div>
  );
}
