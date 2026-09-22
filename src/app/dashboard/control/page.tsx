import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { db } from "@/lib/db";
import { controlDelPeriodo, diaEcuador, ETIQUETA_HORA } from "@/lib/control-publicitario";
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

const VISTAS = ["resultados", "economia", "enlazar", "testeos"] as const;
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
  const periodo = resolverPeriodo(p, hoy);
  const hora = Number(p.hora) || 23;
  const productIds = (p.productos ?? "").split(",").filter(Boolean);

  const productos = await db.product.findMany({
    where: { organizationId: session.organizationId, archived: false },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });

  let cuerpo: React.ReactNode = null;

  if (vista === "resultados") {
    const control = await controlDelPeriodo(session.organizationId, {
      desde: periodo.desde,
      hasta: periodo.hasta,
      hora,
      productIds,
    });
    // Los meses que se ofrecen en el selector: los catorce últimos.
    const meses = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
      return {
        id: `mes-${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`,
        texto: `${NOMBRE_MES[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
      };
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
    const anio = Number(p.anio) || hoy.getUTCFullYear();
    const mes = Number(p.mes) || hoy.getUTCMonth() + 1;
    const [variables, gastoAdm, conGasto] = await Promise.all([
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
        productos={productos}
        pautados={conGasto}
        variables={variables}
        gastoAdm={gastoAdm?.valor ?? null}
        enlaceAdm={gastoAdm?.enlace ?? null}
      />
    );
  } else if (vista === "testeos") {
    // La ventana en instantes: los testeos se cuentan sobre órdenes, que sí
    // tienen hora (el día de Ecuador arranca a las 05:00 UTC).
    const desdeInstante = new Date(periodo.desde.getTime() + 5 * 3600_000);
    const hastaInstante = new Date(periodo.hasta.getTime() + 29 * 3600_000);
    const [testeos, dias] = await Promise.all([
      testeosDelPeriodo(session.organizationId, desdeInstante, hastaInstante),
      pedidosRealesPorDia(session.organizationId, desdeInstante, hastaInstante),
    ]);
    const pedidosDelControl = dias.reduce(
      (t, d) => t + [...d.porProducto.values()].reduce((a, b) => a + b, 0) + d.sinAsignar,
      0,
    );
    cuerpo = (
      <Testeos
        datos={testeos}
        periodo={periodo.id === "personalizado" ? `${isoDay(periodo.desde)} a ${isoDay(periodo.hasta)}` : periodo.id}
        pedidosDelControl={pedidosDelControl}
        verCifras={true}
      />
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
    for (const k of ["periodo", "desde", "hasta"] as const) if (p[k]) q.set(k, p[k]!);
    return `/dashboard/control?${q.toString()}`;
  };

  const TABS: { id: Vista; label: string }[] = [
    { id: "resultados", label: "Resultados" },
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
