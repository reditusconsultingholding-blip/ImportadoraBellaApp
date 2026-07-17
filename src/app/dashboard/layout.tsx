import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import LogoutButton from "./logout-button";

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
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
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">{session.name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
