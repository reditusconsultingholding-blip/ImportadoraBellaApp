import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import TableroDia from "./tablero-dia";
import LotesCruzados from "./lotes-cruzados";
import CalendarioContenido from "./calendario-contenido";
import GestionCampanas from "./gestion-campanas";
import PanelRendimiento from "./panel-rendimiento";

const VISTAS = ["calendario", "tablero", "lotes", "campanas", "rendimiento"] as const;
type Vista = (typeof VISTAS)[number];
function esVista(v: string | undefined): v is Vista {
  return Boolean(v && (VISTAS as readonly string[]).includes(v));
}

const TABS: { id: Vista; label: string }[] = [
  { id: "calendario", label: "Calendario" },
  { id: "tablero", label: "Día a día" },
  { id: "lotes", label: "Lotes" },
  { id: "campanas", label: "Gestión de campañas" },
  { id: "rendimiento", label: "Rendimiento" },
];

export default async function ContenidoPage({
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
          Todavía no tienes un rol asignado. Pídele a un administrador que te asigne
          &quot;Director operativo&quot; o &quot;Editor&quot; desde Usuarios.
        </p>
      </div>
    );
  }

  const { vista: vistaRaw } = await searchParams;
  const vista: Vista = esVista(vistaRaw) ? vistaRaw : "calendario";
  const canManage = canManagePipeline(session.role);

  const users = await db.user.findMany({
    where: { organizationId: session.organizationId, role: { in: ["OWNER", "DIRECTOR", "EDITOR"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Se usa en varias pestañas (tablero, gestión de campañas): una sola
  // consulta, no una por pestaña.
  const products =
    vista === "tablero" || vista === "campanas"
      ? await db.product.findMany({
          where: { organizationId: session.organizationId, archived: false },
          select: { id: true, code: true, name: true },
          orderBy: { name: "asc" },
        })
      : [];

  let tablero: React.ReactNode = null;
  if (vista === "tablero") {
    const tareas = await db.tareaDiaria.findMany({
      where: { organizationId: session.organizationId },
      include: {
        owner: { select: { id: true, name: true } },
        product: { select: { id: true, code: true, name: true } },
        lote: { select: { id: true, numero: true, nomenclatura: true } },
      },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      take: 400,
    });
    tablero = (
      <TableroDia
        canManage={canManage}
        currentUserId={session.userId}
        users={users}
        products={products}
        initialTareas={tareas.map((t) => ({
          ...t,
          fecha: t.fecha ? t.fecha.toISOString() : null,
          createdAt: t.createdAt.toISOString(),
        }))}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-[22px] font-semibold">Contenido</h1>
          {canManage && (
            <Link
              href="/dashboard/contenido/importar"
              className="text-xs text-accent-strong hover:underline"
            >
              Traer datos de Notion →
            </Link>
          )}
        </div>
        <p className="mt-0.5 text-sm text-muted">
          El calendario de entregas, el día a día del equipo, los lotes de contenido, la gestión de
          campañas y el rendimiento de cada integrante — en un solo lugar, sin Notion ni WhatsApp.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-border pb-4">
        {TABS.map((t) => {
          const activo = vista === t.id;
          return (
            <Link
              key={t.id}
              href={`/dashboard/contenido?vista=${t.id}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                activo
                  ? "border-accent bg-good-bg text-accent-strong"
                  : "border-border text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {vista === "calendario" ? (
        <CalendarioContenido />
      ) : vista === "tablero" ? (
        tablero
      ) : vista === "lotes" ? (
        <LotesCruzados />
      ) : vista === "campanas" ? (
        <GestionCampanas products={products} />
      ) : (
        <PanelRendimiento />
      )}
    </div>
  );
}
