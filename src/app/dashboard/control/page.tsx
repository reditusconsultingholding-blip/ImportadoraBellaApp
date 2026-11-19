import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { db } from "@/lib/db";
import { controlDelPeriodo, diaEcuador, economiaDelMes, esElMesEnCurso, ETIQUETA_HORA } from "@/lib/control-publicitario";
import { nombresResueltos, nombresSinEnlazar } from "@/lib/enlazar-pedidos";
import { EncabezadoSeccion, InsigniaEncabezado } from "../encabezado-seccion";
import OrigenPedidos from "./origen-pedidos";
import Resultados from "./resultados";
import Economia from "./economia";
import Enlazar from "./enlazar";
import { resolverPeriodo } from "@/lib/control-opciones";
import { testeosDelPeriodo } from "@/lib/testeos";
import { pedidosRealesPorDia } from "@/lib/pedidos-reales";
import Testeos from "./testeos";
import { productosPautadosDelMes } from "@/lib/pautados";
import { shopifyVsAds } from "@/lib/shopify-vs-ads";
import { cpaDePlanilla } from "@/lib/shopify-vs-ads-calculo";
import CuadreShopifyAds from "./cuadre";
import RiesgoProductos, { type FilaRiesgo } from "./riesgo";
import FiltroPeriodo from "./filtro-periodo";

// El control de gastos publicitarios.
//
// Reemplaza la planilla que el equipo cuadra a mano dos días después. La
// vista principal es el PERÍODO, no el día: se elige julio y se ve julio —el
// total, el CPA del mes, cada producto con lo suyo—, que es como el equipo lo
// lee en las herramientas que ya usa. El detalle día por día queda a un clic,
// para cuando haga falta, en vez de ser lo primero que aparece.
//
// La cuenta es la del archivo del equipo, con dos cosas documentadas en
// src/lib/control-publicitario.ts: los pedidos son los reales de la tienda, y
// los gastos operativos usan producción más flete.

const VISTAS = ["resultados", "cuadre", "riesgo", "economia", "enlazar", "testeos"] as const;
type Vista = (typeof VISTAS)[number];
const esVista = (v: string | undefined): v is Vista =>
  Boolean(v && (VISTAS as readonly string[]).includes(v));

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

const NOMBRE_MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Los períodos rápidos, resueltos contra el día de hoy en Ecuador. */

export default async function ControlPage({
  searchParams,
}: {
  searchParams: Promise<{
    vista?: string;
    periodo?: string;
    desde?: string;
    hasta?: string;
    hora?: string;
    productos?: string;
    detalle?: string;
    anio?: string;
    mes?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManagePipeline(session.role)) redirect("/dashboard");
  // Esta pantalla es la utilidad del negocio, producto por producto. Sin el
  // permiso de finanzas no se abre, igual que Rentabilidad.
  if (!(await veLasCifras(session.userId))) redirect("/dashboard");

  const p = await searchParams;
  const vista: Vista = esVista(p.vista) ? p.vista : "resultados";

  const hoy = diaEcuador();
  // «Hoy» solo existe en Shopify vs Ads, que se mira en vivo; el resto del
  // control trabaja con días cerrados.
  const periodo =
    p.periodo === "hoy" && !p.desde && vista === "cuadre"
      ? { id: "hoy", desde: hoy, hasta: hoy }
      : resolverPeriodo(p.periodo === "hoy" ? { ...p, periodo: undefined } : p, hoy);
  const hora = Number(p.hora) || 23;
  const productIds = (p.productos ?? "").split(",").filter(Boolean);

  const productos = await db.product.findMany({
    where: { organizationId: session.organizationId, archived: false },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });

  // Los catorce últimos meses. Los usan Resultados y Economía, así que se
  // arman una sola vez.
  const meses = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
    return {
      id: `mes-${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`,
      anio: d.getUTCFullYear(),
      mes: d.getUTCMonth() + 1,
      texto: `${NOMBRE_MES[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    };
  });

  let cuerpo: React.ReactNode = null;

  if (vista === "resultados") {
    const control = await controlDelPeriodo(session.organizationId, {
      desde: periodo.desde,
      hasta: periodo.hasta,
      hora,
      productIds,
    });
    cuerpo = (
      <Resultados
        control={control}
        productos={productos}
        periodo={periodo.id}
        desde={isoDay(periodo.desde)}
        hasta={isoDay(periodo.hasta)}
        hora={hora}
        seleccion={productIds}
        detalle={p.detalle === "dia"}
        meses={meses}
      />
    );
  } else if (vista === "economia") {
    // EL MES NO SE PIERDE AL CAMBIAR DE PESTAÑA.
    //
    // Antes esta vista solo miraba `anio`/`mes` de la URL, y como ninguna
    // pantalla los ponía, siempre caía en el mes actual. Alguien que venía
    // mirando "mes pasado" en Resultados pasaba a Economía y veía octubre sin
    // que nada se lo dijera. Emilia lo reportó como "¿por qué acá no me
    // aparece entre dos fechas?": no le faltaba el rango, le faltaba poder
    // cambiar el mes.
    //
    // Ahora, si no se pidió un mes explícito, se toma el del período que se
    // venía mirando —el del día final, que es el que manda en "mes pasado" o
    // "este mes"—.
    const anio = Number(p.anio) || periodo.hasta.getUTCFullYear();
    const mes = Number(p.mes) || periodo.hasta.getUTCMonth() + 1;
    const [variables, efectiva, gastoAdm, conGasto] = await Promise.all([
      db.variableProducto.findMany({
        where: { organizationId: session.organizationId, anio, mes },
        select: {
          productId: true,
          efectividad: true,
          produccion: true,
          flete: true,
          precioProm: true,
          cpaMin: true,
          devoluciones: true,
        },
      }),
      // LO QUE EL CONTROL ESTA USANDO DE VERDAD, no solo lo cargado a mano.
      //
      // Esta pantalla mostraba unicamente las filas de VariableProducto: una
      // celda vacia por cada producto sin cargar. Pero desde que la economia
      // se toma de la Calculadora, el Control SI tiene numeros para esos
      // productos -- los calcula y los usa-- y aqui no se veian. Emilia abria
      // Economia por producto para revisar las cifras del Control, encontraba
      // la tabla igual de vacia que antes y reportaba "me aparece lo que
      // estaba, me aparece mal la informacion aun": la pantalla no mentia en
      // lo que decia, mentia en lo que callaba.
      //
      // Es la MISMA funcion que alimenta Resultados, a proposito: dos cuentas
      // parecidas en dos archivos es la forma mas silenciosa de que un dia
      // dejen de coincidir, que es justo el reclamo que estamos cerrando.
      economiaDelMes(session.organizationId, anio, mes),
      db.gastoAdmMes.findUnique({
        where: { organizationId_anio_mes: { organizationId: session.organizationId, anio, mes } },
        select: { valor: true, enlace: true },
      }),
      // Los productos que se pautaron ese mes: es con lo que abre la tabla.
      productosPautadosDelMes(session.organizationId, anio, mes),
    ]);
    cuerpo = (
      <Economia
        anio={anio}
        mes={mes}
        enCurso={esElMesEnCurso(anio, mes)}
        meses={meses}
        productos={productos}
        pautados={conGasto}
        variables={variables}
        efectiva={[...efectiva].flatMap(([productId, e]) =>
          // Lo del mes queda fuera: ya viaja en `variables` y se muestra como
          // valor cargado, no como numero en gris.
          //
          // Y una ficha en ceros tampoco entra. `economiaDelMes` siembra TODOS
          // los productos del catalogo con su ficha, y el catalogo tiene
          // cientos que no se pautan hace meses y nunca tuvieron precio ni
          // costo cargado. Mostrarlos con "0" en gris y la etiqueta naranja
          // llenaria la tabla de avisos sobre productos que a nadie le
          // importan, y el reclamo que estamos cerrando es justamente que la
          // pantalla mostraba cosas que no corresponden.
          e.origen === "mes" || (e.origen === "ficha" && e.precioProm === 0 && e.produccion === 0)
            ? []
            : [
                {
                  productId,
                  origen: e.origen,
                  efectividad: e.efectividad,
                  produccion: e.produccion,
                  flete: e.flete,
                  precioProm: e.precioProm,
                  cpaMin: e.cpaMin,
                  devoluciones: e.devoluciones,
                },
              ],
        )}
        gastoAdm={gastoAdm?.valor ?? null}
        enlaceAdm={gastoAdm?.enlace ?? null}
      />
    );
  } else if (vista === "cuadre") {
    const datos = await shopifyVsAds(session.organizationId, periodo.desde, periodo.hasta);
    cuerpo = (
      <>
        <FiltroPeriodo
          vista="cuadre"
          periodo={periodo.id}
          desde={isoDay(periodo.desde)}
          hasta={isoDay(periodo.hasta)}
          meses={meses}
        />
        <CuadreShopifyAds datos={datos} editable={canManagePipeline(session.role)} />
      </>
    );
  } else if (vista === "riesgo" || vista === "testeos") {
    // EL TABLERO DE EMILIA, CON SUS MISMAS CUENTAS (revisado el 18-nov):
    //   - Pedidos y confirmación: la planilla del área comercial del período,
    //     confirmados ÷ pedidos.
    //   - Pedidos de plataforma y gasto: Meta + TikTok por producto, sin la
    //     cuenta de ventas por WhatsApp.
    //   - CPA real: gasto ÷ pedidos de la planilla.
    // La clasificación se hace en la pantalla, porque los umbrales se mueven
    // ahí. La utilidad sigue saliendo del control (economía de la Calculadora).
    const desdeInstante = new Date(periodo.desde.getTime() + 5 * 3600_000);
    const hastaInstante = new Date(periodo.hasta.getTime() + 29 * 3600_000);
    const [control, cuadre, testeosPedidos, dias] = await Promise.all([
      controlDelPeriodo(session.organizationId, {
        desde: periodo.desde,
        hasta: periodo.hasta,
        hora: 23,
        productIds: [],
      }),
      shopifyVsAds(session.organizationId, periodo.desde, periodo.hasta),
      vista === "testeos" ? testeosDelPeriodo(session.organizationId, desdeInstante, hastaInstante) : null,
      vista === "testeos" ? pedidosRealesPorDia(session.organizationId, desdeInstante, hastaInstante) : null,
    ]);
    const utilidadDe = new Map(control.productos.filter((f) => f.productId).map((f) => [f.productId!, f.utilidad]));
    const filas: FilaRiesgo[] = [
      ...cuadre.productos
        .filter((f) => f.productId && (f.ventas > 0 || f.gasto > 0 || f.plataforma > 0))
        .map((f) => ({
          clave: f.productId!,
          productId: f.productId,
          nombre: f.nombre,
          sku: f.sku,
          etiquetas: f.etiquetas,
          pedidos: f.ventas,
          confirmados: f.confirmados,
          confirmacion: f.ventas > 0 ? f.confirmados / f.ventas : null,
          plataforma: f.plataforma,
          shopify: f.shopify,
          meta: f.meta,
          tiktok: f.tiktok,
          gasto: f.gasto,
          cpa: cpaDePlanilla(f.gasto, f.ventas),
          cpaObjetivo: f.cpaObjetivo,
          utilidad: utilidadDe.get(f.productId!) ?? null,
          sinEnlazar: false,
        })),
      // Los nombres de la planilla que todavía no tienen producto: cuentan en
      // los totales del comercial, pero sin gasto no entran en el riesgo.
      ...cuadre.sinEnlazar.map((s) => ({
        clave: `nombre:${s.nombre}`,
        productId: null,
        nombre: s.nombre,
        sku: null,
        etiquetas: [],
        pedidos: s.ventas,
        confirmados: s.confirmados,
        confirmacion: s.ventas > 0 ? s.confirmados / s.ventas : null,
        plataforma: 0,
        shopify: null,
        meta: 0,
        tiktok: 0,
        gasto: 0,
        cpa: null,
        cpaObjetivo: null,
        utilidad: null,
        sinEnlazar: true,
      })),
    ];
    const pedidosDelControl = (dias ?? []).reduce(
      (t, d) => t + [...d.porProducto.values()].reduce((a, b) => a + b, 0) + d.sinAsignar,
      0,
    );
    cuerpo = (
      <>
        <FiltroPeriodo
          vista={vista}
          periodo={periodo.id}
          desde={isoDay(periodo.desde)}
          hasta={isoDay(periodo.hasta)}
          meses={meses}
          conHoy={false}
        />
        <RiesgoProductos
          filas={filas}
          gastoSinProducto={cuadre.productos.find((f) => !f.productId)?.gasto ?? 0}
          editable={canManagePipeline(session.role)}
          modo={vista === "testeos" ? "testeos" : "riesgo"}
        />
        {testeosPedidos && (
          <details className="mt-5 rounded-xl border border-border bg-surface px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              Pedidos marcados uno por uno como testeo y gasto de las campañas «TEST»
            </summary>
            <p className="mt-1 text-xs text-muted">
              Es otra cosa: los pedidos sueltos que se marcan desde «Enlazar pedidos» para que no sumen a la utilidad, y
              cuánto se gasta en campañas con TEST en el nombre (que en Jarvis son las iniciales de cualquier producto).
            </p>
            <div className="mt-4">
              <Testeos
                datos={testeosPedidos}
                periodo={periodo.id === "personalizado" ? `${isoDay(periodo.desde)} a ${isoDay(periodo.hasta)}` : periodo.id}
                pedidosDelControl={pedidosDelControl}
                verCifras={true}
              />
            </div>
          </details>
        )}
      </>
    );
  } else {
    const [pendientes, resueltos] = await Promise.all([
      nombresSinEnlazar(session.organizationId, periodo.desde, periodo.hasta),
      nombresResueltos(session.organizationId, periodo.desde, periodo.hasta),
    ]);
    cuerpo = (
      <Enlazar
        pendientes={pendientes}
        resueltos={resueltos}
        productos={productos}
        desde={isoDay(periodo.desde)}
        hasta={isoDay(periodo.hasta)}
      />
    );
  }

  const conservar = (v: Vista) => {
    const q = new URLSearchParams({ vista: v });
    for (const k of ["periodo", "desde", "hasta", "anio", "mes"] as const) if (p[k]) q.set(k, p[k]!);
    return `/dashboard/control?${q.toString()}`;
  };

  const TABS: { id: Vista; label: string }[] = [
    { id: "resultados", label: "Resultados" },
    { id: "cuadre", label: "Shopify vs Ads" },
    { id: "riesgo", label: "Riesgo por producto" },
    { id: "economia", label: "Economía por producto" },
    { id: "enlazar", label: "Enlazar pedidos" },
    { id: "testeos", label: "Testeos" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoSeccion
        eyebrow="Números"
        titulo="Control publicitario"
        insignia={
          vista === "resultados" && hora !== 23 ? (
            <InsigniaEncabezado>{ETIQUETA_HORA[hora]}</InsigniaEncabezado>
          ) : undefined
        }
        descripcion="Los pedidos reales de la tienda contra todo lo que se gastó en pauta, con la economía de cada producto. Es la planilla del equipo, calculada sola."
      />

      <nav className="flex flex-wrap gap-1.5 border-b border-border pb-4">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={conservar(t.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              vista === t.id
                ? "border-accent bg-good-bg text-accent-strong"
                : "border-border text-muted hover:border-border-strong hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {/* De dónde salen los pedidos del período que se está mirando. Va
          arriba de todo: es la primera pregunta cuando un número no cuadra
          con la planilla del equipo. */}
      <OrigenPedidos desde={isoDay(periodo.desde)} hasta={isoDay(periodo.hasta)} />

      {cuerpo}
    </div>
  );
}
