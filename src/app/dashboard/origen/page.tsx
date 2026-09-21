import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { resolveRange } from "@/lib/date-range";
import { NOMBRE_CAJA, origenPorVenta, type Caja } from "@/lib/origen-pedidos";
import { nombresSinEnlazar } from "@/lib/enlazar-pedidos";
import RangePicker from "../range-picker";
import { EncabezadoSeccion, InsigniaEncabezado } from "../encabezado-seccion";

// De dónde viene cada venta. El método está en src/lib/origen-pedidos.ts.
//
// La regla de esta pantalla: cada número tiene que poder comprobarse. Las
// cajas suman exactamente las ventas de la tienda, la fila de total lo dice,
// y abajo está la lista venta por venta (y el archivo para bajarla entera)
// con la caja de cada una.

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const num = (n: number) => n.toLocaleString("es-EC");

const ORDEN: Caja[] = ["meta", "tiktok", "ambas", "sin_pauta", "sin_identificar", "testeo"];

const EXPLICA: Record<Caja, string> = {
  meta: "El producto tenía campañas gastando ese día solo en Meta.",
  tiktok: "El producto tenía campañas gastando ese día solo en TikTok.",
  ambas: "El producto tenía campañas gastando ese día en Meta y en TikTok a la vez.",
  sin_pauta:
    "El producto no gastó un dólar ese día en ninguna plataforma. No la trajo un anuncio de ese día: es recompra, recomendación, WhatsApp o un anuncio viejo que alguien guardó.",
  sin_identificar:
    "El nombre del producto en Shopify no está enlazado a ningún producto de Jarvis, así que no se puede saber si tenía pauta. Se arregla enlazándolo.",
  testeo: "Producto marcado como testeo. El control publicitario no lo cuenta.",
};

const TONO: Record<Caja, string> = {
  meta: "bg-accent",
  tiktok: "bg-[#4338ca]",
  ambas: "bg-[#0891b2]",
  sin_pauta: "bg-warning",
  sin_identificar: "bg-critical",
  testeo: "bg-muted",
};

export default async function OrigenPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string; desde?: string; hasta?: string; caja?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManagePipeline(session.role)) redirect("/dashboard");
  const verCifras = await veLasCifras(session.userId);

  const params = await searchParams;
  const range = resolveRange(params.rango ?? "ayer", params.desde, params.hasta);
  const desdeDia = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), range.from.getUTCDate()));
  const hastaDia = new Date(Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), range.to.getUTCDate()));
  const [r, sueltos] = await Promise.all([
    origenPorVenta(session.organizationId, range),
    nombresSinEnlazar(session.organizationId, desdeDia, hastaDia),
  ]);

  const pct = (n: number) => (r.total > 0 ? `${Math.round((n / r.total) * 1000) / 10}%` : "0%");
  const cajaFiltro = (ORDEN as string[]).includes(params.caja ?? "") ? (params.caja as Caja) : null;
  const filtradas = cajaFiltro ? r.ventas.filter((v) => v.caja === cajaFiltro) : r.ventas;
  const lista = filtradas.slice(0, 300);
  const reportadas = r.reportaMeta + r.reportaTiktok;
  const porEmbudo = r.canales.filter((c) => /funnelish|releasit/i.test(c.canal)).reduce((s, c) => s + c.ventas, 0);

  const query =
    range.id === "personalizado"
      ? `rango=personalizado&desde=${isoDay(range.from)}&hasta=${isoDay(range.to)}`
      : `rango=${range.id}`;

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoSeccion
        eyebrow="Números"
        titulo="Origen de las ventas"
        insignia={<InsigniaEncabezado>{range.label}</InsigniaEncabezado>}
        descripcion="Cada venta de la tienda, puesta en una sola caja según si su producto tenía anuncios ese día y en qué plataforma. Las cajas suman exactamente el total, y abajo está la lista venta por venta para comprobarlo."
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

      {/* La respuesta en una frase. Es lo que se lee en voz alta en la reunión. */}
      <section className="rounded-lg border border-accent/40 bg-good-bg/40 p-5">
        <p className="text-[15px] leading-relaxed text-foreground">
          En el período ({range.label.toLowerCase()}) entraron <b>{num(r.total)} ventas</b>.{" "}
          <b>
            {num(r.conPauta)} ({pct(r.conPauta)})
          </b>{" "}
          son de productos que tenían anuncios activos ese mismo día.
          {r.cajas.sin_pauta > 0 && (
            <>
              {" "}
              <b>{num(r.cajas.sin_pauta)}</b> son de productos sin ningún anuncio ese día.
            </>
          )}
          {r.cajas.sin_identificar > 0 && (
            <>
              {" "}
              <b>{num(r.cajas.sin_identificar)}</b> son de productos que Jarvis todavía no puede identificar (falta
              enlazar su nombre).
            </>
          )}
          {r.cajas.testeo > 0 && (
            <>
              {" "}
              <b>{num(r.cajas.testeo)}</b> son de testeo.
            </>
          )}
        </p>
      </section>

      {/* Las cajas. Una venta está en una sola; la fila de total lo prueba. */}
      <section className="rounded border border-border bg-surface">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">1. Cada venta, en una sola caja</h2>
          <p className="mt-0.5 text-xs text-muted">
            Se mira el producto de cada venta y si ese producto gastó en Meta o TikTok ese día (hora de Ecuador). Toca
            una caja para ver sus ventas en la lista de abajo.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-5 py-2 font-medium">Caja</th>
                <th className="px-3 py-2 text-right font-medium">Ventas</th>
                <th className="px-3 py-2 text-right font-medium">%</th>
                <th className="px-5 py-2 font-medium">Qué significa</th>
              </tr>
            </thead>
            <tbody>
              {ORDEN.filter((c) => r.cajas[c] > 0 || c === "sin_pauta").map((c) => (
                <tr key={c} className="border-b border-border/60 align-top">
                  <td className="px-5 py-2.5">
                    <Link
                      href={`/dashboard/origen?${query}&caja=${c}#ventas`}
                      className="flex items-center gap-2 font-medium text-foreground hover:underline"
                    >
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONO[c]}`} />
                      {NOMBRE_CAJA[c]}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-foreground">{num(r.cajas[c])}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted">{pct(r.cajas[c])}</td>
                  <td className="px-5 py-2.5 text-xs leading-relaxed text-muted">{EXPLICA[c]}</td>
                </tr>
              ))}
              <tr className="bg-surface-2">
                <td className="px-5 py-2.5 font-semibold text-foreground">Total de ventas de la tienda</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-foreground">{num(r.total)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted">100%</td>
                <td className="px-5 py-2.5 text-xs text-muted">Es el mismo número de órdenes que muestra Shopify.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Dentro de lo pautado: qué reportan los píxeles contra lo real. */}
      <section className="rounded border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">
          2. De las {num(r.conPauta)} ventas con anuncios, ¿cuántas reportan Meta y TikTok?
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Ventas reales con anuncios", valor: num(r.conPauta), nota: "lo que entró a la tienda" },
            { label: "Reporta Meta", valor: num(r.reportaMeta), nota: "compras en el administrador de anuncios" },
            { label: "Reporta TikTok", valor: num(r.reportaTiktok), nota: "compras en TikTok Ads" },
            {
              label: "Ninguno las reporta",
              valor: num(r.sinReportar),
              nota: r.conPauta > 0 ? `${Math.round((r.sinReportar / r.conPauta) * 100)}% de las ventas con anuncios` : "",
            },
          ].map((t) => (
            <div key={t.label} className="rounded border border-border bg-surface-2 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{t.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{t.valor}</p>
              <p className="text-xs text-muted">{t.nota}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Se compara producto por producto y día por día. Donde hubo más ventas reales que compras reportadas, la
          diferencia son ventas que los píxeles no vieron (<b className="text-foreground">{num(r.sinReportar)}</b>). Donde
          los píxeles reportaron más compras que ventas reales, son compras contadas de más (
          <b className="text-foreground">{num(r.deMas)}</b>): pasa cuando Meta y TikTok se atribuyen la misma compra, o
          la cuentan en el día del clic y no en el de la compra. Por eso {num(r.reportaMeta)} + {num(r.reportaTiktok)} ={" "}
          {num(reportadas)} no es igual a {num(r.conPauta)}: las dos diferencias van en sentidos contrarios y no se
          compensan entre sí.
        </p>
      </section>

      {r.porProducto.length > 0 && (
        <section className="rounded border border-border bg-surface">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">3. Producto por producto</h2>
            <p className="mt-0.5 text-xs text-muted">
              Si las ventas sin reportar se reparten entre muchos productos, es sub-registro de los píxeles. Si se
              concentran en uno solo, hay que revisar sus campañas.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-5 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 text-right font-medium">Ventas reales</th>
                  <th className="px-3 py-2 text-right font-medium">Reporta Meta</th>
                  <th className="px-3 py-2 text-right font-medium">Reporta TikTok</th>
                  <th className="px-3 py-2 text-right font-medium">Sin reportar</th>
                  <th className="px-5 py-2 text-right font-medium">Reportadas de más</th>
                </tr>
              </thead>
              <tbody>
                {r.porProducto.slice(0, 60).map((p) => (
                  <tr key={p.producto} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-2 text-foreground">{p.producto}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{num(p.ventas)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{num(p.meta)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{num(p.tiktok)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${p.sinReportar > 0 ? "text-foreground" : "text-muted"}`}>
                      {num(p.sinReportar)}
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums text-muted">{num(p.deMas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-foreground">Datos aparte (no son cajas)</h2>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {r.canales.map((c) => (
              <li key={c.canal} className="flex justify-between gap-3">
                <span className="text-muted">Entraron por {c.canal}</span>
                <span className="tabular-nums text-foreground">
                  {num(c.ventas)} <span className="text-muted">({pct(c.ventas)})</span>
                </span>
              </li>
            ))}
            <li className="flex justify-between gap-3">
              <span className="text-muted">El comprador ya había comprado antes (mismo teléfono)</span>
              <span className="tabular-nums text-foreground">
                {num(r.recurrentes)} <span className="text-muted">({pct(r.recurrentes)})</span>
              </span>
            </li>
          </ul>
          <p className="mt-3 text-xs text-muted">
            Un cliente que vuelve puede estar en cualquier caja: si su producto tenía anuncios ese día, cuenta como venta
            con anuncios. Por eso esto va aparte y no se suma.
          </p>
        </section>

        <section className="rounded border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-foreground">Lo que no se puede saber hoy, y cómo resolverlo</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Qué anuncio exacto trajo a cada comprador. El {pct(porEmbudo)} de las ventas entra por Funnelish o
            Releasit, que cobran fuera de Shopify: la orden llega ya hecha y sin el enlace de la visita. De{" "}
            {num(r.total)} órdenes, <b className="text-foreground">{num(r.conUtm)}</b> traen ese dato.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            <b className="text-foreground">Para tenerlo venta por venta:</b> en Funnelish, activar que los parámetros utm
            de la visita pasen a la orden de Shopify (como atributos o notas de la orden). Jarvis ya está preparado para
            leerlos: el día que lleguen, cada venta muestra su campaña sin tocar nada más.
          </p>
        </section>
      </div>

      {sueltos.length > 0 && (
        <section className="rounded border border-warning/40 bg-pending-bg p-5">
          <h2 className="text-sm font-semibold text-foreground">Productos sin identificar: los nombres a enlazar</h2>
          <p className="mt-1 text-xs text-muted">
            Cada nombre que se enlace en «Control publicitario › Enlazar pedidos» sale de la caja roja y pasa a la que le
            corresponde.
          </p>
          <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
            {sueltos.slice(0, 20).map((n) => (
              <li key={n.nombre} className="flex justify-between gap-3">
                <span className="min-w-0 truncate text-foreground">{n.nombre}</span>
                <span className="shrink-0 tabular-nums text-muted">{num(n.pedidos)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* La prueba: venta por venta. */}
      <section id="ventas" className="rounded border border-border bg-surface">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              4. Venta por venta{cajaFiltro ? ` · ${NOMBRE_CAJA[cajaFiltro]}` : ""}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              El número de Shopify sirve para buscar la orden en el admin.{" "}
              {lista.length < filtradas.length
                ? `Se muestran las ${lista.length} más recientes de ${num(filtradas.length)}; el archivo trae todas.`
                : `Son ${num(filtradas.length)}.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {cajaFiltro && (
              <Link
                href={`/dashboard/origen?${query}#ventas`}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
              >
                Ver todas
              </Link>
            )}
            <a
              href={`/api/origen/ventas?${query}`}
              className="rounded-full border border-accent px-3 py-1.5 text-xs font-medium text-accent-strong hover:bg-good-bg"
            >
              Descargar todas (Excel)
            </a>
          </div>
        </div>
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-5 py-2 font-medium">Día y hora</th>
                <th className="px-3 py-2 font-medium">N.º Shopify</th>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 font-medium">Caja</th>
                <th className="px-3 py-2 font-medium">Entró por</th>
                <th className="px-3 py-2 font-medium">Ya compró antes</th>
                {verCifras && <th className="px-5 py-2 text-right font-medium">Valor</th>}
              </tr>
            </thead>
            <tbody>
              {lista.map((v) => (
                <tr key={v.shopifyId} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-1.5 tabular-nums text-muted">
                    {v.dia.slice(5)} {v.hora}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-muted">{v.shopifyId}</td>
                  <td className="px-3 py-1.5 text-foreground">{v.producto}</td>
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
                      <span className={`h-2 w-2 rounded-full ${TONO[v.caja]}`} />
                      {NOMBRE_CAJA[v.caja]}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted">{v.canal}</td>
                  <td className="px-3 py-1.5 text-xs text-muted">{v.recurrente ? "Sí" : "No"}</td>
                  {verCifras && <td className="px-5 py-1.5 text-right tabular-nums text-muted">{money(v.facturado)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
