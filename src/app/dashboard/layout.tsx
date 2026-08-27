import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import LogoutButton from "./logout-button";
import LiveIndicator from "./live-indicator";
import LiveRefresher from "./live-refresher";
import SidebarNav from "./sidebar-nav";
import NotificationsBell from "./notifications-bell";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [org, me] = await Promise.all([
    db.organization.findUnique({ where: { id: session.organizationId } }),
    // El permiso de nómina se lee de la base, no del JWT — ver payroll-access.ts.
    db.user.findUnique({
      where: { id: session.userId },
      select: { canViewPayroll: true, avatarUrl: true },
    }),
  ]);

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-60 shrink-0 bg-brand-navy flex flex-col sticky top-0 h-screen">
        <div className="px-5 pt-5 pb-4">
          <p className="text-white/50 font-semibold uppercase tracking-[0.14em] text-[10px] leading-none">
            Importadora
          </p>
          <p className="text-white font-semibold text-[22px] leading-tight tracking-tight">Bella</p>
        </div>

        <SidebarNav
          showUsuarios={session.role === "OWNER"}
          showPipeline={canAccessPipeline(session.role)}
          showRentabilidad={canManagePipeline(session.role)}
          showNomina={Boolean(me?.canViewPayroll)}
        />

        <div className="mt-auto border-t border-white/10 px-3 py-3">
          <div className="flex items-center gap-2.5 rounded px-2 py-1.5">
            {me?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={me.avatarUrl}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-green/20 text-[11px] font-semibold text-brand-green">
                {initials(session.name)}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-white">
                {session.name}
              </span>
              <span className="block truncate text-[11px] text-white/45">
                {org?.name ?? "Importadora Bella"}
              </span>
            </span>
            <LogoutButton />
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Barra superior mínima a propósito: acá antes vivía una franja de
            métricas (sesiones, ventas totales, pedidos, conversión) que
            competía con el contenido de cada pantalla. Las métricas ahora
            viven en el Panel, que es donde se las va a buscar. */}
        <header className="sticky top-0 z-10 bg-background/85 backdrop-blur-sm border-b border-border">
          <div className="px-8 h-14 flex items-center justify-end gap-3">
            <LiveIndicator />
            <NotificationsBell />
          </div>
        </header>
        <LiveRefresher />
        <main className="px-8 py-8 w-full max-w-[1200px]">{children}</main>
      </div>
    </div>
  );
}
