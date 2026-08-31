import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { getRentabilidad } from "@/lib/rentabilidad";
import { resolveRange } from "@/lib/date-range";
import RangePicker from "../range-picker";
import TablaRentabilidad from "./tabla-rentabilidad";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export default async function RentabilidadPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string; desde?: string; hasta?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManagePipeline(session.role)) redirect("/dashboard");
  // Esta pantalla ES el dinero: utilidad, margen y punto de equilibrio por
  // producto. Quien no tiene el permiso de finanzas no la abre, y el enlace
  // tampoco le aparece en el menú.
  if (!(await veLasCifras(session.userId))) redirect("/dashboard");

  const params = await searchParams;
  // Treinta días por defecto: es el período con el que se decide escalar o
  // apagar, y el que tiene la atribución más asentada.
  const range = resolveRange(params.rango ?? "30d", params.desde, params.hasta);
  const data = await getRentabilidad(session.organizationId, range);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold">Rentabilidad por producto</h1>
          <p className="mt-0.5 text-sm text-muted">
            {range.label} · con el precio, costo, flete, efectividad y devoluciones reales de cada
            producto.
          </p>
        </div>
        <RangePicker
          active={range.id}
          label={range.label}
          from={isoDay(range.from)}
          to={isoDay(range.to)}
          platform="META"
          basePath="/dashboard/rentabilidad"
        />
      </div>

      <TablaRentabilidad data={data} />
    </div>
  );
}
