import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { db } from "@/lib/db";
import { diaEcuador } from "@/lib/control-publicitario";
import { EncabezadoSeccion } from "../encabezado-seccion";
import ListaPagos, { type Pago } from "./lista-pagos";

export default async function PagosPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManagePipeline(session.role)) redirect("/dashboard");
  // Son montos de plata: mismo criterio que Control publicitario y Rentabilidad.
  if (!(await veLasCifras(session.userId))) redirect("/dashboard");

  const pagos: Pago[] = await db.pagoRecurrente.findMany({
    where: { organizationId: session.organizationId },
    select: {
      id: true,
      nombre: true,
      monto: true,
      moneda: true,
      diaDelMes: true,
      avisarDiasAntes: true,
      activo: true,
      notas: true,
    },
    orderBy: { nombre: "asc" },
  });

  // El día se calcula en el servidor y viaja como texto: el navegador de quien
  // mira puede estar en otro huso, y "faltan 2 días" tiene que decir lo mismo
  // para todos.
  const hoy = diaEcuador();

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoSeccion
        eyebrow="Números"
        titulo="Pagos y suscripciones"
        descripcion="Las apps que se cobran todos los meses, con su día y su monto. La app avisa antes de cada cobro, así que la fecha deja de vivir en la cabeza de alguien."
      />
      <ListaPagos inicial={pagos} hoyISO={hoy.toISOString().slice(0, 10)} />
    </div>
  );
}
