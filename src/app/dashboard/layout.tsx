import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getHeaderStats } from "@/lib/sales";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import LogoutButton from "./logout-button";
import HeaderStats from "./header-stats";
import LiveIndicator from "./live-indicator";
import LiveRefresher from "./live-refresher";
import SidebarNav from "./sidebar-nav";
import NotificationsBell from "./notifications-bell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [org, headerStats, me] = await Promise.all([
    db.organization.findUnique({ where: { id: session.organizationId } }),
    getHeaderStats(session.organizationId),
    // El permiso de nómina se lee de la base, no del JWT — ver payroll-access.ts.
    db.user.findUnique({
      where: { id: session.userId },
      select: { canViewPayroll: true },
    }),
  ]);

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-56 shrink-0 bg-brand-navy flex flex-col sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-white/10">
          <p className="text-white font-bold uppercase tracking-wide text-sm leading-tight truncate">
            Importadora
          </p>
          <p className="text-white/95 font-serif italic text-2xl leading-tight -mt-0.5">Bella</p>
          <p className="font-mono text-[10px] uppercase tracking-wide text-brand-green mt-1.5">
            Jarvis &middot; {org?.name ?? "Importadora Bella"}
          </p>
        </div>
        <SidebarNav
          showUsuarios={session.role === "OWNER"}
          showPipeline={canAccessPipeline(session.role)}
          showRentabilidad={canManagePipeline(session.role)}
          showNomina={Boolean(me?.canViewPayroll)}
        />
        <div className="mt-auto px-5 py-4 border-t border-white/10 flex items-center justify-between">
          <span className="text-sm text-white/80 truncate">{session.name}</span>
          <LogoutButton />
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="px-6 py-3 flex items-center justify-end gap-3">
            <LiveIndicator />
            <NotificationsBell />
          </div>
          <div className="px-6 pb-4">
            <HeaderStats stats={headerStats} />
          </div>
        </header>
        <LiveRefresher />
        <main className="px-6 py-8 max-w-5xl">{children}</main>
      </div>
    </div>
  );
}
