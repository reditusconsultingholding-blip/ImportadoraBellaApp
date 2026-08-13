import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAccessPipeline } from "@/lib/permissions";
import { getLogisticsOverview } from "@/lib/logistics";
import LogisticsTower from "./logistics-tower";

export default async function LogisticaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canAccessPipeline(session.role)) redirect("/dashboard");

  const data = await getLogisticsOverview(session.organizationId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Torre logística — Ecuador</h1>
        <p className="text-sm text-muted">
          Efectividad de entrega por provincia y transportadora, conectado a Dropi.
        </p>
      </div>
      {!data.connected && (
        <div className="bg-accent/10 border border-accent/30 rounded p-4 text-sm">
          <p className="font-medium text-accent-strong mb-1">Mostrando datos de ejemplo</p>
          <p className="text-muted">
            Todavía no hay una cuenta de Dropi conectada — anda a{" "}
            <a href="/dashboard/conexiones" className="text-accent hover:underline">Conexiones</a> para pegar la
            key cuando Dropi te la habilite. Mientras tanto, esto muestra cómo se va a ver la torre real.
          </p>
        </div>
      )}
      <LogisticsTower data={data} />
    </div>
  );
}
