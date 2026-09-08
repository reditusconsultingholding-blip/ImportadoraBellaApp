import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveRange } from "@/lib/date-range";
import { getPanelCeo } from "@/lib/ceo";
import { veLasCifras } from "@/lib/finanzas";
import RangePicker from "../range-picker";
import PanelCeoVista from "./panel-ceo";
import { EncabezadoSeccion, InsigniaEncabezado } from "../encabezado-seccion";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export default async function PanelCeoPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string; desde?: string; hasta?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  // Es el panel del dueño: solo OWNER. Un director ve lo suyo en las pantallas
  // de siempre.
  if (session.role !== "OWNER") redirect("/dashboard");
  // Y además el permiso de finanzas: el panel del dueño es facturación,
  // utilidad y costos de punta a punta. Ser OWNER no alcanza si el permiso
  // por persona no está puesto.
  if (!(await veLasCifras(session.userId))) redirect("/dashboard");

  const params = await searchParams;
  const range = resolveRange(params.rango ?? "30d", params.desde, params.hasta);

  // El permiso de nómina se lee de la base, no del rol: hay dueños que no lo
  // tienen.
  const [data, usuario] = await Promise.all([
    getPanelCeo(session.organizationId, range),
    db.user.findUnique({
      where: { id: session.userId },
      select: { canViewPayroll: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoSeccion
        eyebrow="Dirección"
        titulo="Estadísticas CEO"
        insignia={<InsigniaEncabezado>{range.label}</InsigniaEncabezado>}
        descripcion="El negocio entero en seis vistas, con los mismos números que ve el equipo."
        acciones={
          <RangePicker
            active={range.id}
            label={range.label}
            from={isoDay(range.from)}
            to={isoDay(range.to)}
            platform="META"
            basePath="/dashboard/ceo"
          />
        }
      />

      <PanelCeoVista
        data={data}
        periodo={range.label}
        puedeVerNomina={Boolean(usuario?.canViewPayroll)}
      />
    </div>
  );
}
