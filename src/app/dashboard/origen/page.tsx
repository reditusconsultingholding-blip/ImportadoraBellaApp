import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { resolveRange } from "@/lib/date-range";
import { reporteDeOrigen } from "@/lib/origen-ventas";
import RangePicker from "../range-picker";
import { EncabezadoSeccion, InsigniaEncabezado } from "../encabezado-seccion";

// El reporte diario de "¿de dónde salieron las ventas que la pauta no
// explica?". La explicación del método está en src/lib/origen-ventas.ts.

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const num = (n: number) => n.toLocaleString("es-EC");

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

  const brecha = r.ordenes - r.atribuidas;
  const pct = (n: number) => (r.ordenes > 0 ? Math.round((n / r.ordenes) * 100) : 0);
  const pedidosSinPauta = r.sinPauta.reduce((s, p) => s + p.reales, 0);
  // Lo que queda después de las señales que sí tienen nombre.
  const señales = r.recompras + pedidosSinPauta + r.sinEnlazar;
  const subRegistro = Math.max(0, brecha - señales);

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoSeccion
        eyebrow="Números"
        titulo="Origen de las ventas"
        insignia={<InsigniaEncabezado>{range.label}</InsigniaEncabezado>}
        descripcion="De dónde salen las ventas que Meta y TikTok no se atribuyen. Compara producto por producto lo que vendió la tienda contra lo que reportan sus campañas, y separa lo que sí tiene explicación: clientes que ya habían comprado, productos sin pauta ese día y nombres todavía sin enlazar."
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
          { label: "Ventas de la tienda", valor: num(r.ordenes), nota: verCifras ? `${money(r.gasto)} de pauta` : undefined },
          { label: "Se atribuyen Meta y TikTok", valor: num(r.atribuidas), nota: `${pct(r.atribuidas)}% de las ventas` },
          { label: "Diferencia a explicar", valor: num(brecha), nota: `${pct(brecha)}% de las ventas` },
          { label: "Ya habían comprado antes", valor: num(r.recompras), nota: "clientes que vuelven" },
        ].map((t) => (
          <div key={t.label} className="rounded border border-border bg-surface p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{t.valor}</p>
            {t.nota && <p className="text-xs text-muted">{t.nota}</p>}
          </div>
        ))}
      </div>

      {/* El desarme de la diferencia. Es la respuesta corta a la pregunta. */}
      <section className="rounded border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">Qué hay detrás de esa diferencia</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Son señales, no cajones: una misma venta puede ser de un cliente que ya había comprado <em>y</em> de un nombre
          sin enlazar, así que no suman exacto.{" "}
          {señales >= brecha && brecha > 0
            ? "Acá alcanzan de sobra para explicar la diferencia: no hay ventas de origen desconocido."
            : "Lo que sobra después de ellas es sub-registro del píxel."}
        </p>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {[
            {
              n: r.recompras,
              texto: "de clientes que ya habían comprado antes. No necesitan ver un anuncio nuevo: entran directo por el enlace que ya tienen.",
            },
            {
              n: pedidosSinPauta,
              texto: `de ${r.sinPauta.length === 1 ? "un producto que no tuvo" : `${r.sinPauta.length} productos que no tuvieron`} un dólar de pauta en el período.`,
            },
            {
              n: r.sinEnlazar,
              texto: "de nombres de Shopify todavía sin enlazar a un producto: existen y se cobraron, pero no se pueden comparar contra ninguna campaña.",
            },
            {
              n: subRegistro,
              texto: "sin otra explicación que el sub-registro del píxel: zona horaria, iOS y la ventana de atribución. Se reparte parejo entre todos los productos, que es la huella de un problema de medición y no de una cuenta publicitaria escondida.",
            },
          ]
            .filter((x) => x.n > 0)
            .map((x) => (
              <li key={x.texto} className="flex gap-3">
                <span className="w-12 shrink-0 text-right text-lg font-semibold tabular-nums text-accent-strong">{num(x.n)}</span>
                <span className="text-muted">{x.texto}</span>
              </li>
            ))}
          {brecha <= 0 && <li className="text-muted">En este período la pauta se atribuye tantas ventas como las que entraron, o más.</li>}
        </ul>
        <p className="mt-4 rounded bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
          <span className="font-semibold text-foreground">Por qué no se puede afinar más:</span> las ventas entran por
          Funnelish y Releasit, que cobran fuera de Shopify. La tienda recibe la orden ya hecha y nunca ve la visita, así
          que no hay UTM ni sitio de referencia que guardar
          {r.conOrigenPropio > 0 ? ` (hoy solo ${num(r.conOrigenPropio)} órdenes traen ese dato)` : ""}. Para cerrar ese
          hueco hay que activar en el embudo el paso de los parámetros utm a la orden; el día que lleguen, aparecen acá
          sin tocar nada.
        </p>
      </section>

      <section className="rounded border border-border bg-surface">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Producto por producto</h2>
          <p className="mt-0.5 text-xs text-muted">
            Lo que vendió la tienda contra lo que reportan sus campañas. La diferencia repartida entre muchos productos
            es sub-registro; concentrada en uno solo, es una campaña mal enlazada.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-5 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 text-right font-medium">Ventas reales</th>
                <th className="px-3 py-2 text-right font-medium">Se atribuye la pauta</th>
                <th className="px-3 py-2 text-right font-medium">Diferencia</th>
                {verCifras && <th className="px-5 py-2 text-right font-medium">Gasto</th>}
              </tr>
            </thead>
            <tbody>
              {r.porProducto.map((p) => (
                <tr key={p.productId} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-2">
                    <span className="font-mono text-[11px] text-muted">{p.codigo}</span>{" "}
                    <span className="text-foreground">{p.producto}</span>
                    {p.gasto === 0 && <span className="ml-2 text-[11px] text-warning">sin pauta</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{num(p.reales)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{num(p.atribuidas)}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      p.diferencia > 0 ? "text-foreground" : p.diferencia < 0 ? "text-muted" : "text-muted"
                    }`}
                  >
                    {p.diferencia > 0 ? `+${num(p.diferencia)}` : num(p.diferencia)}
                  </td>
                  {verCifras && <td className="px-5 py-2 text-right tabular-nums text-muted">{money(p.gasto)}</td>}
                </tr>
              ))}
              {r.porProducto.length === 0 && (
                <tr>
                  <td colSpan={verCifras ? 5 : 4} className="px-5 py-6 text-center text-sm text-muted">
                    No hubo ventas en el período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        {r.nombresSinEnlazar.length > 0 && (
          <section className="rounded border border-warning/40 bg-pending-bg p-5">
            <h2 className="text-sm font-semibold text-foreground">Nombres sin enlazar</h2>
            <p className="mt-1 text-xs text-muted">
              Se vendieron y no caen en ningún producto. Cada uno que se enlace en «Control publicitario › Enlazar
              pedidos» sale de esta diferencia para siempre.
            </p>
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {r.nombresSinEnlazar.map((n) => (
                <li key={n.nombre} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-foreground">{n.nombre}</span>
                  <span className="shrink-0 tabular-nums text-muted">{num(n.pedidos)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {r.recompraPorAntiguedad.length > 0 && (
          <section className="rounded border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-foreground">Cuándo compraron antes</h2>
            <p className="mt-1 text-xs text-muted">
              De los clientes que volvieron en este período. Cuanto más viejo el anterior, menos probable es que la
              compra de hoy la haya traído un anuncio de hoy.
            </p>
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {r.recompraPorAntiguedad.map((t) => (
                <li key={t.tramo} className="flex justify-between gap-3">
                  <span className="text-foreground">{t.tramo}</span>
                  <span className="tabular-nums text-muted">{num(t.clientes)} clientes</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
