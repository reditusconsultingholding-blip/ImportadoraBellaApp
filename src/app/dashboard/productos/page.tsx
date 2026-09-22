import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import ProductDirectory from "./directory";
import CatalogPicker from "../catalog-picker";
import NuevoProducto from "./nuevo-producto";
import { getDirectory } from "@/lib/product-directory";
import { resolveRange, toInputValue } from "@/lib/date-range";
import RangePicker from "../range-picker";
import { puedeDecidir } from "@/lib/product-actions";
import { veLasCifras } from "@/lib/finanzas";
import { EncabezadoSeccion } from "../encabezado-seccion";

export default async function ProductosPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string; desde?: string; hasta?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canAccessPipeline(session.role)) redirect("/dashboard");

  const canManage = canManagePipeline(session.role);

  // El período estaba clavado en 30 días, así que el gasto, el CPA y el pulso
  // de cada producto contaban siempre lo mismo y no había forma de preguntar
  // "¿cómo le fue ayer?" sin irse a la ficha producto por producto.
  const params = await searchParams;
  const range = resolveRange(params.rango, params.desde, params.hasta);

  // Ya no hay tablero libre: el directorio hace lo mismo y encima se puede
  // buscar y ordenar. Un lienzo con tarjetas sirve para pensar diez ideas;
  // para seguir ciento diecisiete productos hace falta una lista.
  // El permiso viaja hasta getDirectory y no hasta el componente: las filas
  // se arman ya sin precio, costo, margen, gasto ni CPA, así que esos
  // números no llegan al navegador ni siquiera dentro del HTML.
  const verCifras = await veLasCifras(session.userId);
  const directorio = await getDirectory(session.organizationId, range, verCifras);

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoSeccion
        eyebrow="Producción"
        titulo="Productos"
        descripcion="Todo lo que se está siguiendo, con su pulso, su economía y sus creativos. Busca por nombre o por el código que usan las campañas, y entra a cualquiera para ver su seguimiento de creativos y su dirección creativa."
        acciones={
          <RangePicker
            active={range.id}
            label={range.label}
            from={toInputValue(range.from)}
            to={toInputValue(range.to)}
            platform="META"
            basePath="/dashboard/productos"
          />
        }
      />

      {canManage && (
        <div className="flex flex-wrap items-start gap-2">
          <CatalogPicker />
          <NuevoProducto />
        </div>
      )}

      <ProductDirectory
        periodo={range.label}
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
