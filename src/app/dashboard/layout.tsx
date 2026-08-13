import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getHeaderStats } from "@/lib/sales";
import { canAccessPipeline } from "@/lib/permissions";
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

  const org = await db.organization.findUnique({
    where: { id: session.organizationId },
  });
  const headerStats = await getHeaderStats(session.organizationId);

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-56 shrink-0 border-r border-border flex flex-col sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-border">
          <p className="font-mono text-xs uppercase tracking-wide text-accent">Jarvis</p>
          <p className="text-sm text-muted truncate">{org?.name}</p>
        </div>
        <SidebarNav showUsuarios={session.role === "OWNER"} showPipeline={canAccessPipeline(session.role)} />
        <div className="mt-auto px-5 py-4 border-t border-border flex items-center justify-between">
          <span className="text-sm text-muted truncate">{session.name}</span>
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
