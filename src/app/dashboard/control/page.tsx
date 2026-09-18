import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { db } from "@/lib/db";
import {
  controlPublicitario,
  resumenDelMes,
  ETIQUETA_HORA,
  HORAS_CORTE,
  diaEcuador,
} from "@/lib/control-publicitario";
import { EncabezadoSeccion, InsigniaEncabezado } from "../encabezado-seccion";
import TablaControl from "./tabla-control";
import TablaMes from "./tabla-mes";
import Economia from "./economia";

// El control de gastos publicitarios.
//
// Reemplaza la planilla que el equipo cuadra a mano dos días después de que
// pasaron las cosas: una fila por producto, por día y por corte, con los
// pedidos, el CPA, el gasto, la efectividad, los pedidos efectivos, los gastos
// operativos y administrativos, y la utilidad.
//
// La cuenta es la del archivo del equipo, con una diferencia documentada en
// src/lib/control-publicitario.ts: los gastos operativos usan producción más
// flete, que es lo que la planilla quiso hacer y no hace.

const VISTAS = ["dia", "mes", "economia"] as const;
type Vista = (typeof VISTAS)[number];
const esVista = (v: string | undefined): v is Vista =>
  Boolean(v && (VISTAS as readonly string[]).includes(v));

const TABS: { id: Vista; label: string }[] = [
  { id: "dia", label: "Día a día" },
  { id: "mes", label: "Resumen del mes" },
  { id: "economia", label: "Economía por producto" },
];

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

const NOMBRE_MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export default async function ControlPage({
  searchParams,
}: {
  searchParams: Promise<{
    vista?: string;
    desde?: string;
    hasta?: string;
    hora?: string;
    producto?: string;
    anio?: string;
    mes?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManagePipeline(session.role)) redirect("/dashboard");
  // Esta pantalla es la utilidad del negocio, producto por producto y hora por
  // hora. Sin el permiso de finanzas no se abre, igual que Rentabilidad.
  if (!(await veLasCifras(session.userId))) redirect("/dashboard");

  const p = await searchParams;
  const vista: Vista = esVista(p.vista) ? p.vista : "dia";

  const hoy = diaEcuador();
  const anio = Number(p.anio) || hoy.getUTCFullYear();
  const mes = Number(p.mes) || hoy.getUTCMonth() + 1;

  // Treinta días por defecto, como el resto de las pantallas de números.
  const hasta = p.hasta ? new Date(`${p.hasta}T00:00:00.000Z`) : hoy;
  const desde = p.desde
    ? new Date(`${p.desde}T00:00:00.000Z`)
    : new Date(hasta.getTime() - 29 * 86400_000);

  const hora = p.hora === "todas" ? undefined : Number(p.hora) || 23;

  const productos = await db.product.findMany({
    where: { organizationId: session.organizationId, archived: false },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });

  let cuerpo: React.ReactNode = null;

  if (vista === "dia") {
    const control = await controlPublicitario(session.organizationId, {
      desde,
      hasta,
      hora,
      productId: p.producto || undefined,
    });
    cuerpo = (
      <TablaControl
        control={control}
        productos={productos}
        desde={isoDay(desde)}
        hasta={isoDay(hasta)}
        hora={hora === undefined ? "todas" : String(hora)}
        producto={p.producto ?? ""}
      />
    );
  } else if (vista === "mes") {
    const resumen = await resumenDelMes(session.organizationId, anio, mes);
    cuerpo = <TablaMes resumen={resumen} anio={anio} mes={mes} />;
  } else {
    const [variables, gastoAdm] = await Promise.all([
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
        select: { valor: true },
      }),
    ]);
    cuerpo = (
      <Economia
        anio={anio}
        mes={mes}
        productos={productos}
        variables={variables}
        gastoAdm={gastoAdm?.valor ?? null}
      />
    );
  }

  const enlaceDe = (v: Vista) => {
    const q = new URLSearchParams({ vista: v });
    if (v === "dia") {
      q.set("desde", isoDay(desde));
      q.set("hasta", isoDay(hasta));
      q.set("hora", hora === undefined ? "todas" : String(hora));
      if (p.producto) q.set("producto", p.producto);
    } else {
      q.set("anio", String(anio));
      q.set("mes", String(mes));
    }
    return `/dashboard/control?${q.toString()}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoSeccion
        eyebrow="Números"
        titulo="Control publicitario"
        insignia={
          <InsigniaEncabezado>
            {vista === "dia"
              ? (ETIQUETA_HORA[hora ?? -1] ?? "Los cuatro cortes")
              : `${NOMBRE_MES[mes - 1]} ${anio}`}
          </InsigniaEncabezado>
        }
        descripcion="El día mirado a las 8, a las 11, a las 4 y al cierre: pedidos, CPA, gasto, efectividad, costos operativos y administrativos, y la utilidad que queda. Es la planilla del equipo, calculada sola."
      />

      <div className="flex flex-wrap gap-1.5 border-b border-border pb-4">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={enlaceDe(t.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              vista === t.id
                ? "border-accent bg-good-bg text-accent-strong"
                : "border-border text-muted hover:border-border-strong hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
        {vista !== "dia" && (
          <div className="ml-auto flex items-center gap-1.5">
            {[-1, 1].map((paso) => {
              const d = new Date(Date.UTC(anio, mes - 1 + paso, 1));
              const q = new URLSearchParams({
                vista,
                anio: String(d.getUTCFullYear()),
                mes: String(d.getUTCMonth() + 1),
              });
              return (
                <Link
                  key={paso}
                  href={`/dashboard/control?${q.toString()}`}
                  className="rounded border border-border px-2 py-1 text-xs text-muted transition hover:text-foreground"
                >
                  {paso < 0 ? "← Mes anterior" : "Mes siguiente →"}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {cuerpo}

      <p className="text-[11px] leading-relaxed text-muted">
        Los cortes son acumulados del mismo día, no tramos: el de las 11 trae lo que va desde la
        medianoche. El resumen del mes suma solo el cierre de las {HORAS_CORTE[3]}, porque sumar los
        cuatro contaría cada día cuatro veces.
      </p>
    </div>
  );
}
