import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import UsersManager from "./users-manager";

export default async function UsuariosPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (session.role !== "OWNER") {
    return (
      <div className="bg-surface border border-border rounded p-6">
        <p className="text-sm text-muted">
          Esta sección es solo para administradores de la organización.
        </p>
      </div>
    );
  }

  const [users, me] = await Promise.all([
    db.user.findMany({
      where: { organizationId: session.organizationId },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        canViewPayroll: true,
        mustChangePassword: true,
        createdAt: true,
        employee: { select: { position: true } },
      },
    }),
    db.user.findUnique({
      where: { id: session.userId },
      select: { canViewPayroll: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-semibold">Usuarios</h1>
        <p className="text-sm text-muted mt-1">
          Quién puede entrar al panel, con qué rol y quién ve la nómina.
        </p>
      </div>
      <UsersManager
        currentUserId={session.userId}
        canGrantPayroll={Boolean(me?.canViewPayroll)}
        initialUsers={users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          canViewPayroll: u.canViewPayroll,
          mustChangePassword: u.mustChangePassword,
          position: u.employee?.position ?? null,
          createdAt: u.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
