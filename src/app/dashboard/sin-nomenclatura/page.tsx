import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { resolveRange } from "@/lib/date-range";
import {
  campanasSinProducto,
  productosSinCampana,
  resumenSinProducto,
} from "@/lib/sin-nomenclatura";
import Lista from "./lista";
import { EncabezadoSeccion, InsigniaEncabezado } from "../encabezado-seccion";

export default async function SinNomenclaturaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManagePipeline(session.role)) redirect("/dashboard");
  // La pantalla ES el gasto que no está asignado: sin el permiso de finanzas la
  // mitad de la tabla se quedaría en guiones y no diría nada. Se cierra entera,
  // igual que Rentabilidad.
  if (!(await veLasCifras(session.userId))) redirect("/dashboard");

  // Treinta días fijos y sin selector de rango: la pregunta acá no es "cuánto
  // gastó esta campaña en marzo", es "qué está suelto AHORA". Un selector
  // invitaría a mirar períodos viejos, donde lo que aparece ya no se puede
  // arreglar porque la campaña ni existe.
  const rango = resolveRange("30d");

  // El resumen se pide aparte de la lista a propósito. La lista viene topada
  // —trescientas filas ya son más de las que nadie va a repasar de una sentada—
  // y contar sobre lo que llegó daría "300 campañas sueltas" cuando son 327: el
  // total tiene que salir de contar todo, no de medir la página.
  const [campanas, resumen, productos, opciones] = await Promise.all([
    campanasSinProducto(session.organizationId, rango),
    resumenSinProducto(session.organizationId, rango),
    productosSinCampana(session.organizationId),
    db.product.findMany({
      where: { organizationId: session.organizationId, archived: false },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const sueltas = resumen.campanas;

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoSeccion
        eyebrow="Producción"
        titulo="Sin nomenclatura"
        insignia={
          <InsigniaEncabezado>
            {sueltas === 0
              ? "Todo emparejado"
              : `${sueltas.toLocaleString("es-EC")} ${sueltas === 1 ? "campaña" : "campañas"}`}
          </InsigniaEncabezado>
        }
        descripcion="Las campañas que no cuelgan de ningún producto y los productos que no tienen ninguna campaña. Es lo que hace que el panel diga que hay órdenes sin explicación: la plata se gastó y las ventas entraron, pero no suman a la rentabilidad de nadie. Acá se emparejan."
      />

      <Lista
        campanas={campanas}
        resumen={resumen}
        productos={productos}
        opciones={opciones}
        periodo={rango.label}
      />
    </div>
  );
}
