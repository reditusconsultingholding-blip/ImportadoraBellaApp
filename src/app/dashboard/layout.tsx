import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import LogoutButton from "./logout-button";
import LiveIndicator from "./live-indicator";
import LiveRefresher from "./live-refresher";
import SidebarNav from "./sidebar-nav";
import NotificationsBell from "./notifications-bell";
import MobileNav from "./mobile-nav";

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

  // El menú y la ficha del usuario se arman una sola vez y se usan en los dos
  // lados: la barra fija de escritorio y el cajón del teléfono. Duplicarlos
  // sería garantizar que en algún momento digan cosas distintas.
  const brand = (
    <>
      <p className="text-white/50 font-semibold uppercase tracking-[0.14em] text-[10px] leading-none">
        Importadora
      </p>
      <p className="text-white font-semibold text-[22px] leading-tight tracking-tight">Bella</p>
    </>
  );

  const nav = (
    <SidebarNav
      showUsuarios={session.role === "OWNER"}
      showPipeline={canAccessPipeline(session.role)}
      showRentabilidad={canManagePipeline(session.role)}
      showNomina={Boolean(me?.canViewPayroll)}
    />
  );

  const account = (
    <div className="mt-auto border-t border-white/10 px-3 py-3">
      <div className="flex items-center gap-2.5 rounded px-2 py-1.5">
        {me?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-green/20 text-[11px] font-semibold text-brand-green">
            {initials(session.name)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-white">{session.name}</span>
          <span className="block truncate text-[11px] text-white/45">
            {org?.name ?? "Importadora Bella"}
          </span>
        </span>
        <LogoutButton />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background md:flex">
      {/* Escritorio: barra lateral fija. En el teléfono se oculta y su lugar lo
          toma el cajón de MobileNav. */}
      <aside className="hidden w-60 shrink-0 bg-brand-navy md:sticky md:top-0 md:flex md:h-screen md:flex-col">
        <div className="px-5 pt-5 pb-4">{brand}</div>
        {nav}
        {account}
      </aside>

      <MobileNav brand={brand}>
        {nav}
        {account}
      </MobileNav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur-sm">
          <div className="flex h-14 items-center justify-end gap-3 px-4 md:px-8">
            <LiveIndicator />
            <NotificationsBell />
          </div>
        </header>
        <LiveRefresher />
        <main className="w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
