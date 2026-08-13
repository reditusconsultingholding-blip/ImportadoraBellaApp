import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import PipelineBoard from "./pipeline-board";

export default async function PipelinePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!canAccessPipeline(session.role)) {
    return (
      <div className="bg-surface border border-border rounded p-6 max-w-lg">
        <p className="text-sm text-muted">
          Todavía no tenés un rol asignado en el pipeline creativo. Pedile a un administrador
          que te asigne "Director operativo" o "Editor / Creador" desde Usuarios.
        </p>
      </div>
    );
  }

  const canManage = canManagePipeline(session.role);

  const [requirements, products, users] = await Promise.all([
    db.requirement.findMany({
      where: {
        organizationId: session.organizationId,
        ...(canManage ? {} : { ownerId: session.userId }),
      },
      include: {
        product: { select: { code: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.product.findMany({ where: { organizationId: session.organizationId } }),
    db.user.findMany({
      where: { organizationId: session.organizationId },
      select: { id: true, name: true, role: true },
    }),
  ]);

  return (
    <PipelineBoard
      canManage={canManage}
      currentUserId={session.userId}
      currentUserName={session.name}
      initialRequirements={requirements.map((r) => ({
        ...r,
        date: r.date.toISOString(),
        dueDate: r.dueDate ? r.dueDate.toISOString() : null,
      }))}
      products={products.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
      users={users}
    />
  );
}
