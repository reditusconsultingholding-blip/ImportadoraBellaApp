import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import { filasVisibles, getOverview } from "@/lib/metrics";
import {
  getPulsoCreativos,
  pulsosCreativosVisibles,
  VENTANA_DIAS,
  ventanasDelPulso,
} from "@/lib/pulso-creativos";
import { creativosSinCifras, veLasCifras } from "@/lib/finanzas";
import PipelineBoard from "./pipeline-board";
import CampanasActivas from "./campanas-activas";
import ProductosPulso from "./productos-pulso";
import VistaTabs, { esVista, type Vista } from "./vista-tabs";

// El pipeline tiene cuatro vistas y cada una baja SOLO sus datos.
//
// Antes era una sola pantalla y cargaba los requerimientos, nada más. Ahora que
// también muestra campañas y el pulso de creativos, traer las tres cosas en
// cada visita significaría pedirle a la base el histórico de métricas para
// mirar un tablero de tarjetas. Por eso la vista viaja en la URL: se conoce
// antes de tocar la base, y se pide lo que esa pestaña necesita.

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!canAccessPipeline(session.role)) {
    return (
      <div className="bg-surface border border-border rounded p-6 max-w-lg">
        <p className="text-sm text-muted">
          Todavía no tienes un rol asignado en el pipeline creativo. Pedile a un administrador
          que te asigne &quot;Director operativo&quot; o &quot;Editor / Creador&quot; desde Usuarios.
        </p>
      </div>
    );
  }

  const canManage = canManagePipeline(session.role);
  const params = await searchParams;
  const vista: Vista = esVista(params.vista) ? params.vista : "kanban";

  // El mismo filtro en todas las vistas: `origen` no nulo es el archivo
  // histórico —seis mil y pico de piezas de otra operación— y llenaría el
  // tablero con trabajo que ya no existe. Un editor, además, solo ve lo suyo.
  // La regla vive acá y no en cada vista para que no se le escape a ninguna.
  const dondeRequerimientos = {
    organizationId: session.organizationId,
    origen: null,
    ...(canManage ? {} : { ownerId: session.userId }),
  };

  const encabezado = (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-[22px] font-semibold">Pipeline</h1>
        <p className="mt-0.5 text-sm text-muted">
          Las piezas en producción, lo que está corriendo en pauta y desde qué producto conviene
          empezar hoy.
        </p>
      </div>
      <VistaTabs activa={vista} />
    </div>
  );

  if (vista === "campanas") {
    // Ventana corta a propósito: "activa" es la que gastó esta semana. Una
    // campaña que entregó hace veinte días y hoy no mueve nada no es algo sobre
    // lo que haya que decidir. Y es literalmente la misma ventana del pulso de
    // creativos, no una equivalente: las dos pestañas tienen que hablar del
    // mismo período o sus números no se pueden cruzar.
    const range = ventanasDelPulso().actual;
    const [verCifras, meta, tiktok] = await Promise.all([
      veLasCifras(session.userId),
      getOverview(session.organizationId, "META", range),
      getOverview(session.organizationId, "TIKTOK", range),
    ]);

    return (
      <div className="flex flex-col gap-6">
        {encabezado}
        {/* Las filas se recortan en el servidor: sin el permiso de finanzas
            el gasto, el ingreso y el CPA no salen de acá. */}
        <CampanasActivas
          meta={{
            filas: filasVisibles(meta.rows, verCifras),
            sinProducto: meta.campaignsWithoutProduct,
          }}
          tiktok={{
            filas: filasVisibles(tiktok.rows, verCifras),
            sinProducto: tiktok.campaignsWithoutProduct,
          }}
          periodo={`Últimos ${VENTANA_DIAS} días · ${range.label}`}
          verCifras={verCifras}
        />
      </div>
    );
  }

  if (vista === "productos") {
    const [verCifras, pulsos, requirements, users] = await Promise.all([
      veLasCifras(session.userId),
      getPulsoCreativos(session.organizationId),
      db.requirement.findMany({
        where: dondeRequerimientos,
        include: {
          product: { select: { code: true, name: true } },
          owner: { select: { id: true, name: true } },
        },
        orderBy: { date: "desc" },
      }),
      db.user.findMany({
        where: { organizationId: session.organizationId },
        select: { id: true, name: true, role: true },
      }),
    ]);

    return (
      <div className="flex flex-col gap-6">
        {encabezado}
        <ProductosPulso
          pulsos={pulsosCreativosVisibles(pulsos, verCifras)}
          verCifras={verCifras}
          initialRequirements={creativosSinCifras(requirements, verCifras).map((r) => ({
            ...r,
            date: r.date.toISOString(),
            dueDate: r.dueDate ? r.dueDate.toISOString() : null,
          }))}
          users={users}
          canManage={canManage}
          currentUserId={session.userId}
          ventanaDias={VENTANA_DIAS}
        />
      </div>
    );
  }

  const [verCifras, requirements, products, users] = await Promise.all([
    veLasCifras(session.userId),
    db.requirement.findMany({
      where: dondeRequerimientos,
      include: {
        product: { select: { code: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.product.findMany({ where: { organizationId: session.organizationId } }),
    db.user.findMany({
      where: { organizationId: session.organizationId },
      select: { id: true, name: true, role: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {encabezado}
      <PipelineBoard
        canManage={canManage}
        verCifras={verCifras}
        currentUserId={session.userId}
        currentUserName={session.name}
        vista={vista === "tabla" ? "table" : "kanban"}
        encabezado={false}
        // El CPA de cada pieza se corta acá: la vista de tabla lo mostraba en
        // una columna, y la fila entera viaja al navegador dentro del HTML.
        initialRequirements={creativosSinCifras(requirements, verCifras).map((r) => ({
          ...r,
          date: r.date.toISOString(),
          dueDate: r.dueDate ? r.dueDate.toISOString() : null,
        }))}
        products={products.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
        users={users}
      />
    </div>
  );
}
