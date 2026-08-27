import { redirect } from "next/navigation";
import { getPayrollViewer } from "@/lib/payroll-access";
import { computeWeek, startOfWeek, weekDays, weekLabel } from "@/lib/payroll";
import PayrollManager from "./payroll-manager";

export default async function NominaPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>;
}) {
  const session = await getPayrollViewer();
  // Sin permiso ni siquiera se entera de que la pantalla existe: vuelve al panel.
  if (!session) redirect("/dashboard");

  const { semana } = await searchParams;
  const base =
    semana && /^\d{4}-\d{2}-\d{2}$/.test(semana) ? new Date(`${semana}T00:00:00.000Z`) : new Date();
  const monday = startOfWeek(base);

  const week = await computeWeek(session.organizationId, monday);

  const prev = new Date(monday);
  prev.setUTCDate(prev.getUTCDate() - 7);
  const next = new Date(monday);
  next.setUTCDate(next.getUTCDate() + 7);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Nómina</h1>
        <p className="text-sm text-muted">
          Lo que hay que pagarle a cada persona esta semana. Marcá los días que no trabajó haciendo
          clic sobre el día y el descuento se calcula solo. Esta pantalla la ven únicamente quienes
          tengan el permiso de nómina.
        </p>
      </div>

      <PayrollManager
        weekStartISO={monday.toISOString().slice(0, 10)}
        weekTitle={weekLabel(monday)}
        prevISO={prev.toISOString().slice(0, 10)}
        nextISO={next.toISOString().slice(0, 10)}
        days={weekDays(monday).map((d) => ({
          iso: d.toISOString().slice(0, 10),
          label: d.toLocaleDateString("es-EC", { weekday: "short", timeZone: "UTC" }),
          dayNumber: d.getUTCDate(),
        }))}
        lines={week.lines}
        total={week.total}
        status={week.status}
        paidAt={week.paidAt ? week.paidAt.toISOString() : null}
        paidByName={week.paidByName}
      />
    </div>
  );
}
