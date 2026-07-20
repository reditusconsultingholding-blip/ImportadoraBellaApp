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

  const users = await db.user.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Usuarios</h1>
        <p className="text-sm text-muted">Quién puede entrar al panel de tu organización.</p>
      </div>
      <UsersManager
        currentUserId={session.userId}
        initialUsers={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
      />
    </div>
  );
}
