import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getHeaderStats } from "@/lib/sales";
import LogoutButton from "./logout-button";
import HeaderStats from "./header-stats";

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
  const headerStats = getHeaderStats();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-accent">
                Jarvis
              </p>
              <p className="text-sm text-muted">{org?.name}</p>
            </div>
            <nav className="flex items-center gap-1">
              <Link
                href="/dashboard"
                className="text-sm font-medium px-3 py-1.5 rounded hover:bg-surface-2 transition"
              >
                Panel
              </Link>
              <Link
                href="/dashboard/jarvis"
                className="text-sm font-medium px-3 py-1.5 rounded hover:bg-surface-2 transition"
              >
                Preguntarle a Jarvis
              </Link>
              <Link
                href="/dashboard/conexiones"
                className="text-sm font-medium px-3 py-1.5 rounded hover:bg-surface-2 transition"
              >
                Conexiones
              </Link>
              {session.role === "OWNER" && (
                <Link
                  href="/dashboard/usuarios"
                  className="text-sm font-medium px-3 py-1.5 rounded hover:bg-surface-2 transition"
                >
                  Usuarios
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">{session.name}</span>
            <LogoutButton />
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-6 pb-4">
          <HeaderStats stats={headerStats} />
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
