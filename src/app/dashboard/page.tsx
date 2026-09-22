import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { filasVisibles, getOverview } from "@/lib/metrics";
import { getSalesOverview } from "@/lib/sales";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { AVISO_SIN_CIFRAS } from "@/lib/finanzas-textos";
import { resolveRange } from "@/lib/date-range";
import { ventasEnElTiempo } from "@/lib/ventas-serie";
import { resumenSinProducto } from "@/lib/sin-nomenclatura";
import PlatformTabs from "./platform-tabs";
import VentasEnElTiempo from "./ventas-en-el-tiempo";
import StatTile from "./stat-tile";
import SalesOverview from "./sales-overview";
import RangePicker from "./range-picker";
import PulsePanel from "./pulse-panel";
import CatalogPicker from "./catalog-picker";
import AttributionStrip from "./attribution-strip";
import AlertasPanel from "./alertas-panel";
import TablaFilas from "./tabla-filas";
import { EncabezadoSeccion, InsigniaEncabezado } from "./encabezado-seccion";
import type { Platform } from "@/generated/prisma/client";
import { ritmoDeVentas } from "@/lib/ritmo-ventas";
import IndicadoresRapidos from "./indicadores-rapidos";
import { testeosDelPeriodo } from "@/lib/testeos";
import { origenPorVenta } from "@/lib/origen-pedidos";
import SeccionPlegable from "./seccion-plegable";

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// Las mismas palabras que el filtro del Pulso, para que la tabla y el
// semáforo de arriba no parezcan dos cosas distintas.
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Se formatea en UTC a proposito: los limites del rango ya vienen como el dia
// calendario de Ecuador, y dejar que el navegador del servidor los reinterprete
// los correria un dia.
const fechaLarga = (d: Date) =>
  d.toLocaleDateString("es-EC", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

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

  // Se pregunta una vez y baja por props. De la BASE, no del token: la
  // sesión dura 30 días y quitarle el acceso a alguien tiene que valer hoy.
  const verCifras = await veLasCifras(session.userId);

  // Se piden las dos plataformas aunque solo se muestre una en la tabla: el
  // bloque de comparación de arriba necesita las dos para poder confrontarlas
  // contra lo que de verdad se vendió en Shopify.
  //
  // Las ventas de Shopify ni se consultan sin el permiso: los dos bloques que
  // las usan no se dibujan, así que traerlas sería pagar la consulta para
  // tirarla.
  //
  // La serie en el tiempo sí se pide siempre, y con `verCifras` adentro: sin
  // el permiso devuelve la CANTIDAD de órdenes y ni siquiera trae el campo de
  // facturación, así que es la única parte de las ventas que ve todo el
  // equipo.
  // Hoy, siempre a la vista. El panel abre con el período que quedó elegido
  // —muchas veces el mes— y para saber cómo viene el día había que cambiar el
  // filtro y volverlo a dejar como estaba. Cuando el período YA es hoy no se
  // pide: sería la misma consulta dos veces.
  const rangoHoy = range.id === "hoy" ? null : resolveRange("hoy");
  const [overview, sales, meta, tiktok, ventas, sinProducto, ritmo, ritmoHoy, metaHoy, tiktokHoy, testeos, origen] =
    await Promise.all([
    getOverview(session.organizationId, platform, range),
    verCifras ? getSalesOverview(session.organizationId, range) : null,
    getOverview(session.organizationId, "META", range),
    getOverview(session.organizationId, "TIKTOK", range),
    ventasEnElTiempo(session.organizationId, range, verCifras),
    // Cuántas campañas quedaron sueltas. Va acá y no dentro del componente por
    // lo mismo: una consulta más encadenada después de dibujar es medio segundo
    // que el panel entero pasa esperando.
    verCifras ? resumenSinProducto(session.organizationId, range) : null,
    // A qué hora compran y cuántas ventas van: la tira de arriba.
    ritmoDeVentas(session.organizationId, range),
    rangoHoy ? ritmoDeVentas(session.organizationId, rangoHoy) : null,
    rangoHoy && verCifras ? getOverview(session.organizationId, "META", rangoHoy) : null,
    rangoHoy && verCifras ? getOverview(session.organizationId, "TIKTOK", rangoHoy) : null,
    // Cuántos de esos pedidos son de testeo. Es la diferencia entre lo que
    // dice el panel (todo lo que entró en la tienda) y lo que cuenta el
    // control (lo que se factura al mes), y sin decirla se lee como un error.
    testeosDelPeriodo(session.organizationId, range.fromInstant, range.toInstant),
    // El CPA objetivo general: el CPA máximo de cada producto pesado por lo
    // que vendió. Solo hace falta si se ven las cifras, y solo hasta un mes:
    // recorre venta por venta, y un año son cien mil.
    verCifras && range.to.getTime() - range.from.getTime() <= 31 * 86400_000
      ? origenPorVenta(session.organizationId, range)
      : null,
  ]);

  // Rendimiento que no es plata, para las tarjetas de quien no ve cifras.
  const impresiones = overview.rows.reduce((s, r) => s + r.impressions, 0);
  const clics = overview.rows.reduce((s, r) => s + r.clicks, 0);

  const query =
    range.id === "personalizado"
      ? `rango=personalizado&desde=${isoDay(range.from)}&hasta=${isoDay(range.to)}`
      : `rango=${range.id}`;

  return (
    <div className="flex flex-col gap-6">
      {/* El selector va arriba de todo: manda sobre las ventas de Shopify, el
          pulso y el rendimiento de campañas. Estaba abajo, junto a las
          campañas, y por eso parecía que las ventas no le hacían caso. */}
      <EncabezadoSeccion
        eyebrow="Resumen"
        titulo="Panel"
        insignia={<InsigniaEncabezado>{range.label}</InsigniaEncabezado>}
        descripcion={
          <>
            {fechaLarga(range.from)}
            {isoDay(range.from) !== isoDay(range.to) ? ` al ${fechaLarga(range.to)}` : ""}
            <span> · hora de Ecuador</span>
          </>
        }
        acciones={
          <RangePicker
            active={range.id}
            label={range.label}
            from={isoDay(range.from)}
            to={isoDay(range.to)}
            platform={platform}
          />
        }
      />

      {/* Lo que se mira primero, sin bajar: ventas, ritmo, CPA y a qué hora
          compran. Va pegado al encabezado a propósito. */}
      <IndicadoresRapidos
        ritmo={ritmo}
        periodo={range.label}
        verCifras={verCifras}
        meta={{ spend: meta.totalSpend, purchases: meta.totalPurchases }}
        tiktok={{ spend: tiktok.totalSpend, purchases: tiktok.totalPurchases }}
        testeo={testeos.pedidos}
        cpaObjetivo={origen?.cpaObjetivo ?? null}
        hoy={
          ritmoHoy
            ? {
                ritmo: ritmoHoy,
                gasto: (metaHoy?.totalSpend ?? 0) + (tiktokHoy?.totalSpend ?? 0),
                conGasto: Boolean(metaHoy),
              }
            : null
        }
      />

      {/* Ventas de Shopify: facturación, ticket promedio y desglose por canal.
          No hay nada que recortar acá dentro —la sección ES el dinero—, así
          que sin el permiso no se pide ni se dibuja. */}
      {sales && <SalesOverview data={sales} periodo={range.label} />}

      {/* Pegada a las ventas de arriba: es la comparación de ESOS números
          contra lo que se cuelga la pauta, así que separarlas con el gráfico
          obligaba a bajar a buscarla. */}
      {sales && canManagePipeline(session.role) && (
        <AttributionStrip
          ventasReales={sales.totalSales}
          ordenesReales={sales.ordenes}
          meta={{ spend: meta.totalSpend, purchases: meta.totalPurchases, revenue: meta.totalRevenue }}
          tiktok={{ spend: tiktok.totalSpend, purchases: tiktok.totalPurchases, revenue: tiktok.totalRevenue }}
          periodo={range.label}
          desdeElPeriodo={isoDay(range.from)}
          ventasDesde={sales.ventasDesde}
          sinProducto={sinProducto ?? { campanas: 0, conGasto: 0, gasto: 0, compras: 0 }}
        />
      )}

      {/* Cuándo se vende, dentro del período elegido. Va acá arriba y no al
          final porque es lo primero que se mira después del total: el total
          dice cuánto, esto dice qué días —o qué horas— lo hicieron. */}
      <VentasEnElTiempo serie={ventas} periodo={range.label} verCifras={verCifras} />

      {/* Qué escalar y qué apagar: esto lo ven todos los que entran acá. Las
          cifras de adentro las recorta /api/alertas según quién pregunta. */}
      {canManagePipeline(session.role) && <AlertasPanel />}

      {canManagePipeline(session.role) && <PulsePanel query={query} />}

      {canManagePipeline(session.role) && <CatalogPicker />}

      {/* La tabla de campañas es lo más largo del panel y lo último que se
          mira: se abre cuando se va a trabajar sobre ella, no cada vez que
          alguien entra a ver cómo va el día. */}
      <SeccionPlegable
        id="rendimiento-campanas"
        eyebrow="Pauta"
        titulo="Rendimiento de campañas"
        resumen={`${overview.rows.length} campañas · solo lo que atribuye la plataforma, las ventas reales están arriba${
          overview.urgentRows.length > 0 ? ` · ${overview.urgentRows.length} necesitan revisión` : ""
        }`}
        etiqueta={range.label}
      >
        <div className="flex flex-col gap-5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PlatformTabs
            active={platform}
            rango={range.id}
            desde={isoDay(range.from)}
            hasta={isoDay(range.to)}
          />
        </div>

        <div className={`grid grid-cols-2 gap-3 ${verCifras ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
          {/* Gasto y ROAS salen de la grilla cuando no corresponde, y su lugar
              lo toman impresiones y CTR. No se ponen en cero ni en guion: un
              cero se lee como un dato, y "—" en una tarjeta de gasto se lee
              como que la campaña no gastó. */}
          {verCifras ? (
            <StatTile label="Gasto total" value={money(overview.totalSpend)} />
          ) : (
            <StatTile
              label="Impresiones"
              value={impresiones.toLocaleString("es-EC")}
              note={`${clics.toLocaleString("es-EC")} clics`}
            />
          )}
          <StatTile label="Compras atribuidas" value={overview.totalPurchases.toLocaleString("es-EC")} />
          {/* El CPA de la plataforma que se está mirando: gasto de esa
              plataforma sobre las compras que ella misma se atribuye. Es el
              número con el que se compara Meta contra TikTok; el CPA contra
              las ventas reales de la tienda está arriba, en la tira. */}
          {verCifras && (
            <StatTile
              label={`CPA ${platform === "META" ? "Meta" : "TikTok"}`}
              value={
                overview.totalPurchases > 0
                  ? (overview.totalSpend / overview.totalPurchases).toLocaleString("es-EC", {
                      style: "currency",
                      currency: "USD",
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : "—"
              }
              note="gasto ÷ compras atribuidas"
            />
          )}
          {verCifras ? (
            <StatTile
              label="ROAS"
              value={overview.roas !== null ? overview.roas.toFixed(2) : "—"}
              note="ingreso atribuido ÷ gasto"
              tone={overview.roas !== null && overview.roas >= 1 ? "good" : overview.roas !== null ? "bad" : "neutral"}
            />
          ) : (
            <StatTile
              label="CTR"
              value={impresiones > 0 ? `${overview.ctr.toFixed(2)}%` : "—"}
              note="clics ÷ impresiones"
            />
          )}
          <StatTile
            label="Necesitan revisión"
            value={overview.urgentRows.length.toString()}
            note={
              overview.urgentRows.length > 0
                ? "Por encima de su objetivo de costo por compra"
                : "Todo dentro de rango"
            }
            tone={overview.urgentRows.length > 0 ? "bad" : "neutral"}
          />
        </div>

        {!verCifras && (
          <p className="rounded border border-border bg-surface px-3 py-2 text-xs text-muted">
            {AVISO_SIN_CIFRAS}
          </p>
        )}

        {overview.campaignsWithoutProduct > 0 && (
          <p className="rounded border border-border bg-pending-bg px-3 py-2 text-xs text-warning">
            {overview.campaignsWithoutProduct} campañas todavía no están asociadas a un producto, así
            que se muestran sueltas y sin semáforo de CPA. Carga los productos en{" "}
            <Link href="/dashboard/productos" className="underline">
              Productos
            </Link>{" "}
            y se enlazan solas por el nombre de la campaña.
          </p>
        )}

        <TablaFilas
          filas={filasVisibles(overview.rows, verCifras)}
          verCifras={verCifras}
          puedeAbrirProducto={canAccessPipeline(session.role)}
        />
        </div>
      </SeccionPlegable>
    </div>
  );
}
