import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveRange } from "@/lib/date-range";
import { getPanelCeo } from "@/lib/ceo";
import RangePicker from "../range-picker";
import PanelCeoVista from "./panel-ceo";

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold">Panel del CEO</h1>
          <p className="mt-0.5 text-sm text-muted">
            {range.label} · el negocio entero en seis vistas, con los mismos números que ve el
            equipo.
          </p>
        </div>
        <RangePicker
          active={range.id}
          label={range.label}
          from={isoDay(range.from)}
          to={isoDay(range.to)}
          platform="META"
          basePath="/dashboard/ceo"
        />
      </div>

      <PanelCeoVista
        data={data}
        periodo={range.label}
        puedeVerNomina={Boolean(usuario?.canViewPayroll)}
      />
    </div>
  );
}
