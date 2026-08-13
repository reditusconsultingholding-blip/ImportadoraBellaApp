import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { getProfitability } from "@/lib/profitability";
import ProfitabilityTable from "./profitability-table";

export default async function RentabilidadPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManagePipeline(session.role)) redirect("/dashboard");

  const params = await searchParams;
  const data = await getProfitability(session.organizationId, params.month);
  const activeMonth = params.month ?? data.months[0] ?? "ABRIL";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Rentabilidad por producto</h1>
        <p className="text-sm text-muted">
          Utilidad acumulada mes a mes, tal como la planilla — acá queda como seguimiento en vivo.
        </p>
      </div>

      <ProfitabilityTable
        initialData={data}
        activeMonth={activeMonth}
        canEdit={session.role === "OWNER" || session.role === "DIRECTOR"}
      />
    </div>
  );
}
