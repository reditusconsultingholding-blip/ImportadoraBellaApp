import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import ProductDirectory from "./directory";
import CatalogPicker from "../catalog-picker";
import { getDirectory } from "@/lib/product-directory";
import { resolveRange } from "@/lib/date-range";
import { puedeDecidir } from "@/lib/product-actions";
import { veLasCifras } from "@/lib/finanzas";

export default async function ProductosPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canAccessPipeline(session.role)) redirect("/dashboard");

  const canManage = canManagePipeline(session.role);


  // Ya no hay tablero libre: el directorio hace lo mismo y encima se puede
  // buscar y ordenar. Un lienzo con tarjetas sirve para pensar diez ideas;
  // para seguir ciento diecisiete productos hace falta una lista.
  // El permiso viaja hasta getDirectory y no hasta el componente: las filas
  // se arman ya sin precio, costo, margen, gasto ni CPA, así que esos
  // números no llegan al navegador ni siquiera dentro del HTML.
  const verCifras = await veLasCifras(session.userId);
  const directorio = await getDirectory(session.organizationId, resolveRange("30d"), verCifras);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-semibold">Productos</h1>
        <p className="mt-1 text-sm text-muted">
          Todo lo que se está siguiendo, con su pulso, su economía y sus creativos. Busca por
          nombre o por el código que usan las campañas, y entra a cualquiera para ver su
          seguimiento de creativos y su dirección creativa.
        </p>
      </div>

      {canManage && <CatalogPicker />}

      <ProductDirectory
        rows={directorio.rows}
        carpetas={directorio.carpetas}
        totales={directorio.totales}
        puedeGestionar={canManage}
        verCifras={verCifras}
        pendientes={directorio.pendientes}
        equipo={directorio.equipo}
        puedeDecidir={puedeDecidir(session.role)}
      />
    </div>
  );
}
