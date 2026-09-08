import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAccessPipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { getLogisticsOverview } from "@/lib/logistics";
import LogisticsTower from "./logistics-tower";
import { EncabezadoSeccion, InsigniaEncabezado } from "../encabezado-seccion";

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
      <EncabezadoSeccion
        eyebrow="Números"
        titulo="Torre logística"
        insignia={<InsigniaEncabezado>Fase 2</InsigniaEncabezado>}
        descripcion="Efectividad de entrega por provincia y transportadora."
      />

      {/* Mientras no haya conexión con Dropi, lo que se ve son datos de
          ejemplo. El aviso anterior lo decía en letra chica debajo del título
          y se leía como una nota al pie: alguien podía mirar el mapa un rato
          antes de entender que ninguna de esas cifras es real. Ahora lo dice
          primero y con el peso que corresponde. */}
      {!data.connected && (
        <div className="rounded-xl border border-border bg-surface-2 p-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-strong">
            Próximamente
          </p>
          <h2 className="mt-2 text-[19px] font-semibold">En construcción — Fase 2</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
            Va a mostrar la efectividad de entrega por provincia y transportadora, con datos reales,
            cuando se conecte la integración con Dropi.
          </p>
          <p className="mx-auto mt-3 max-w-lg text-xs text-muted">
            Hasta entonces la sección queda vacía a propósito. Para conectarla hace falta la clave
            de integración de Dropi, que es privada y se le pide a su equipo.
          </p>
        </div>
      )}

      <div className={data.connected ? "" : "opacity-60"}>
        <LogisticsTower data={data} />
      </div>
    </div>
  );
}
