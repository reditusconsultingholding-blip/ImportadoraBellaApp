import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import TableroNotion from "./tablero-notion";
import LotesCruzados from "./lotes-cruzados";
import CalendarioContenido from "./calendario-contenido";
import GestionCampanas from "./gestion-campanas";
import PanelRendimiento from "./panel-rendimiento";
import Requerimientos from "./requerimientos";
import { EncabezadoSeccion } from "../encabezado-seccion";

const VISTAS = [
  "calendario",
  "tablero",
  "requerimientos",
  "lotes",
  "campanas",
  "rendimiento",
] as const;
type Vista = (typeof VISTAS)[number];
function esVista(v: string | undefined): v is Vista {
  return Boolean(v && (VISTAS as readonly string[]).includes(v));
}

const TABS: { id: Vista; label: string }[] = [
  { id: "calendario", label: "Calendario" },
  { id: "tablero", label: "Día a día" },
  // Va después del día a día y antes de los lotes: es el orden en que se
  // trabaja —qué hay para hoy, qué piezas lo componen, cómo se agrupan—.
  { id: "requerimientos", label: "Requerimientos" },
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
    // `role` lo pide el tipo UserOption que comparten el formulario y la ficha
    // de requerimientos.
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  // Se usa en varias pestañas (tablero, requerimientos, gestión de campañas):
  // una sola consulta, no una por pestaña.
  const products =
    vista === "tablero" ||
    vista === "campanas" ||
    vista === "requerimientos" ||
    vista === "lotes"
      ? await db.product.findMany({
          where: { organizationId: session.organizationId, archived: false },
          select: { id: true, code: true, name: true },
          orderBy: { name: "asc" },
        })
      : [];

  let tablero: React.ReactNode = null;
  if (vista === "tablero") {
    // El tablero se trae sus propias filas por la API en vez de recibirlas ya
    // dibujadas. Es lo que le permite guardar cada celda al salir del campo y
    // mostrarlo al instante: con las filas fijadas en el HTML del servidor,
    // ver el propio cambio obligaría a recargar la página, que es justo la
    // fricción que esta pantalla vino a sacar.
    tablero = (
      <TableroNotion
        canManage={canManage}
        currentUserId={session.userId}
        users={users}
        products={products}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoSeccion
        eyebrow="Producción"
        titulo="Contenido"
        descripcion="El calendario de entregas, el día a día del equipo, los lotes de contenido, la gestión de campañas y el rendimiento de cada integrante — en un solo lugar, sin Notion ni WhatsApp."
        acciones={
          canManage ? (
            <Link
              href="/dashboard/contenido/importar"
              className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white/85 transition hover:bg-white/10"
            >
              Traer datos de Notion →
            </Link>
          ) : null
        }
      />

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
      ) : vista === "requerimientos" ? (
        <Requerimientos
          canManage={canManage}
          currentUserId={session.userId}
          users={users}
          products={products}
        />
      ) : vista === "lotes" ? (
        <LotesCruzados canManage={canManage} products={products} />
      ) : vista === "campanas" ? (
        <GestionCampanas products={products} />
      ) : (
        <PanelRendimiento />
      )}
    </div>
  );
}
