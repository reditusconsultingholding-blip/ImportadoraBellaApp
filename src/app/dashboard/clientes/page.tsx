import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { resolveRange, rangeToParams } from "@/lib/date-range";
import { getPatronesClientes } from "@/lib/clientes";
import { veLasCifras } from "@/lib/finanzas";
import RangePicker from "../range-picker";
import TablaClientes from "./tabla-clientes";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

const money = (n: number, dec = 0) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: dec });

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string; desde?: string; hasta?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  // Son datos personales de los compradores: queda del lado de dirección.
  if (!canManagePipeline(session.role)) redirect("/dashboard");
  // Y además es facturación por persona —cuánto gastó cada cliente, su
  // ticket, cuánto repite—, así que va con el mismo permiso que
  // Rentabilidad. No estaba en la lista que dictó el dueño porque la
  // pantalla no se llama "plata", pero es plata igual.
  if (!(await veLasCifras(session.userId))) redirect("/dashboard");

  const params = await searchParams;
  const range = resolveRange(params.rango ?? "3m", params.desde, params.hasta);
  const datos = await getPatronesClientes(session.organizationId, range);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold">Clientes</h1>
          <p className="mt-0.5 text-sm text-muted">
            {range.label} · quiénes compran, quiénes repiten y qué se llevan juntos.
          </p>
        </div>
        <RangePicker
          active={range.id}
          label={range.label}
          from={isoDay(range.from)}
          to={isoDay(range.to)}
          platform="META"
          basePath="/dashboard/clientes"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Clientes distintos",
            valor: datos.totales.clientes.toLocaleString("es-EC"),
            nota: `${datos.totales.ordenes.toLocaleString("es-EC")} órdenes`,
          },
          {
            label: "Repiten compra",
            valor: datos.totales.repiten.toLocaleString("es-EC"),
            nota:
              datos.totales.clientes > 0
                ? `${Math.round((datos.totales.repiten / datos.totales.clientes) * 100)}% del total`
                : undefined,
          },
          {
            label: "Facturación de quienes repiten",
            valor: `${Math.round(datos.totales.porcionRepiten * 100)}%`,
            nota: money(datos.totales.facturado * datos.totales.porcionRepiten),
          },
          {
            label: "Órdenes sin teléfono",
            valor: datos.totales.sinTelefono.toLocaleString("es-EC"),
            nota: "no se pueden atribuir a nadie",
          },
        ].map((t) => (
          <div key={t.label} className="rounded border border-border bg-surface p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
              {t.label}
            </p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums">{t.valor}</p>
            {t.nota && <p className="text-xs text-muted">{t.nota}</p>}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded border border-border bg-surface">
          <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">
            Dónde se vende
          </p>
          <div className="flex flex-col">
            {datos.porProvincia.slice(0, 10).map((p) => {
              const parte =
                datos.totales.facturado > 0 ? (p.total / datos.totales.facturado) * 100 : 0;
              return (
                <div
                  key={p.provincia}
                  className="flex items-center gap-3 border-b border-border px-4 py-2 last:border-b-0"
                >
                  <span className="w-32 shrink-0 truncate text-sm">{p.provincia}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(2, parte)}%` }}
                    />
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted">
                    {money(p.total)}
                  </span>
                </div>
              );
            })}
            {datos.porProvincia.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted">
                Todavía no hay provincia cargada en las órdenes.
              </p>
            )}
          </div>
        </div>

        <div className="rounded border border-border bg-surface">
          <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">
            Qué se lleva junto con qué
          </p>
          <div className="flex flex-col">
            {datos.combinaciones.slice(0, 10).map((c) => (
              <div
                key={`${c.a}-${c.b}`}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 last:border-b-0"
              >
                <span className="min-w-0 truncate text-sm">
                  {c.a} <span className="text-muted">+</span> {c.b}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {c.veces} veces
                </span>
              </div>
            ))}
            {datos.combinaciones.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted">
                Todavía no hay combinaciones que se repitan al menos tres veces.
              </p>
            )}
          </div>
        </div>
      </div>

      <TablaClientes
        clientes={datos.clientes.map((c) => ({
          ...c,
          primera: c.primera.toISOString(),
          ultima: c.ultima.toISOString(),
        }))}
        totalClientes={datos.totales.clientes}
        urlCsv={`/api/clientes/csv?${rangeToParams(range)}`}
      />
    </div>
  );
}
