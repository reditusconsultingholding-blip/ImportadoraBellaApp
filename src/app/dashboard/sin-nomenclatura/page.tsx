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
import { proponerEnlaces } from "@/lib/enlace-shopify";
import Lista from "./lista";
import Enlaces from "./enlaces";
import { EncabezadoSeccion, InsigniaEncabezado } from "../encabezado-seccion";
import AyudaPantalla from "../ayuda-pantalla";
import SinSku from "./sin-sku";

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
  // El corte de "pauta reciente". Sale de resolveRange y no de un Date.now()
  // suelto: acá adentro estamos en el render de una pantalla, donde leer el
  // reloj directamente da un límite distinto en cada consulta.
  const hace90Dias = resolveRange("3m").from;

  const [campanas, resumen, enlaces, productos, opciones, sinSku] = await Promise.all([
    campanasSinProducto(session.organizationId, rango),
    resumenSinProducto(session.organizationId, rango),
    proponerEnlaces(session.organizationId, rango),
    productosSinCampana(session.organizationId),
    db.product.findMany({
      where: { organizationId: session.organizationId, archived: false },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    // Los que no están conectados a Dropi: los candidatos a depurar. Se pide
    // también si tuvieron pauta en los últimos 90 días, porque un producto con
    // plata puesta hoy no se archiva aunque le falte el SKU.
    db.product.findMany({
      where: { organizationId: session.organizationId, archived: false, sku: null },
      select: {
        id: true,
        code: true,
        name: true,
        _count: { select: { campaigns: true } },
        campaigns: {
          select: {
            metrics: {
              where: {
                capturedAt: { gte: hace90Dias },
                spend: { gt: 0 },
              },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { name: "asc" },
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
        acciones={
          <AyudaPantalla
            id="sin-nomenclatura"
            titulo="Qué hay que hacer en esta pantalla"
            resumen="Emparejar lo que la tienda vendió y lo que la pauta gastó con los productos de Jarvis. Son tres listas y cada una se resuelve eligiendo un producto."
            pasos={[
              {
                titulo: "Nombres de Shopify sin producto",
                texto:
                  "Cada fila es un nombre con el que la tienda facturó y que Jarvis no sabe de qué producto es. Elige el producto (se busca escribiendo: nombre, código o iniciales) y esa facturación empieza a contar en Rentabilidad y en el control. Si el nombre es un envío, una garantía o un testeo, márcalo como «no es un producto» y deja de aparecer.",
              },
              {
                titulo: "Campañas sin producto",
                texto:
                  "Campañas que gastaron plata y que Jarvis no puede colgar de ningún producto, casi siempre porque su nombre no empieza con el código. Asígnales el producto acá; la asignación a mano se respeta y la sincronización no la pisa.",
              },
              {
                titulo: "Productos sin campañas",
                texto:
                  "Productos que existen en Jarvis y no tienen ninguna campaña asociada. O están sin pautar, o su campaña está en la lista de arriba esperando que alguien la empareje.",
              },
              {
                titulo: "Para que no vuelva a pasar",
                texto:
                  "Nombra las campañas empezando por el código del producto: «134142 / TE GINSENG / ABO / COST CAP», y con lote «134142-3 / …». Así se enlazan solas y esta pantalla queda vacía.",
              },
            ]}
            porQue="Mientras algo esté acá, su gasto y su facturación no suman a ningún producto: el panel muestra órdenes sin explicación, la rentabilidad sale corta y el CPA de ese producto no es real."
          />
        }
      />

      {/* Los enlaces con Shopify van primero: son los que mueven la
          facturación entera, mientras que emparejar campañas mueve el gasto.
          Quien entra acá viendo que Rentabilidad no cuadra tiene que dar con
          esto sin buscar. */}
      <Enlaces
        propuestas={enlaces.propuestas}
        cobertura={enlaces.cobertura}
        opciones={opciones}
        periodo={rango.label}
      />

      <SinSku
        productos={sinSku.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          campanas: p._count.campaigns,
          conPautaReciente: p.campaigns.some((c) => c.metrics.length > 0),
        }))}
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
