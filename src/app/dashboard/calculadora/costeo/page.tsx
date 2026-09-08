import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import CosteoCalculadora, { type FichaCalculadora } from "./costeo-calculadora";
import { EncabezadoSeccion, InsigniaEncabezado } from "../../encabezado-seccion";

export default async function CosteoPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManagePipeline(session.role)) redirect("/dashboard");
  // Precio, costo y utilidad de punta a punta: mismo cerrojo que la calculadora
  // de precios y que Rentabilidad.
  if (!(await veLasCifras(session.userId))) redirect("/dashboard");

  // Solo productos con precio y costo: cargar uno sin esos dos datos pondría la
  // calculadora en cero y parecería que la herramienta está rota.
  const fichas: FichaCalculadora[] = await db.product.findMany({
    where: {
      organizationId: session.organizationId,
      archived: false,
      salePrice: { gt: 0 },
    },
    select: {
      code: true,
      name: true,
      salePrice: true,
      unitCost: true,
      flete: true,
      efectividad: true,
      devoluciones: true,
      cpaTarget: true,
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoSeccion
        eyebrow="Números"
        titulo="Costeo y utilidad"
        insignia={<InsigniaEncabezado>En dólares</InsigniaEncabezado>}
        descripcion="Cuánto deja de verdad un producto una vez que la publicidad, las cancelaciones y las devoluciones entran en la cuenta. Se responde en tres pasos y no modifica nada: es para probar antes de decidir."
        acciones={
          <Link
            href="/dashboard/calculadora"
            className="rounded border border-white/20 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/45 hover:bg-white/10 hover:text-white"
          >
            Calculadora de precios
          </Link>
        }
      />

      <CosteoCalculadora fichas={fichas} />
    </div>
  );
}
