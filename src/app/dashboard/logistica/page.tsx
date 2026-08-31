import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAccessPipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { getLogisticsOverview } from "@/lib/logistics";
import LogisticsTower from "./logistics-tower";

export default async function LogisticaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canAccessPipeline(session.role)) redirect("/dashboard");
  // "Ni Torre logística": va con el mismo permiso que Rentabilidad y la
  // Calculadora, aunque acá lo que se mira sean entregas y no dólares.
  if (!(await veLasCifras(session.userId))) redirect("/dashboard");

  const data = await getLogisticsOverview(session.organizationId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Torre logística — Ecuador</h1>
        <p className="text-sm text-muted">
          Efectividad de entrega por provincia y transportadora.
        </p>
      </div>
      {!data.connected && (
        <div className="bg-surface-2 border border-border rounded p-4 text-sm">
          <p className="font-medium mb-1">Vista previa — módulo a futuro</p>
          <p className="text-muted">
            Esto muestra cómo se va a ver esta sección con datos reales de logística más adelante.
            No es parte del alcance actual — por ahora es solo una demostración con datos de ejemplo.
          </p>
        </div>
      )}
      <LogisticsTower data={data} />
    </div>
  );
}
