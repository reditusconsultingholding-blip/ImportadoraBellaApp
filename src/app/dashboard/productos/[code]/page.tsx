import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import PipelineBoard from "../../pipeline/pipeline-board";

const DONE = new Set(["REALIZADO", "EDITADO", "TESTEADO"]);

export default async function ProductoDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canAccessPipeline(session.role)) redirect("/dashboard");

  const { code } = await params;
  const product = await db.product.findFirst({
    where: { organizationId: session.organizationId, code },
  });
  if (!product) notFound();

  const canManage = canManagePipeline(session.role);

  const [requirements, users] = await Promise.all([
    db.requirement.findMany({
      where: {
        organizationId: session.organizationId,
        productId: product.id,
        ...(canManage ? {} : { ownerId: session.userId }),
      },
      include: {
        product: { select: { code: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.user.findMany({
      where: { organizationId: session.organizationId },
      select: { id: true, name: true, role: true },
    }),
  ]);

  const done = requirements.filter((r) => DONE.has(r.status));
  const pending = requirements.length - done.length;
  const tested = requirements.filter((r) => r.status === "TESTEADO" && r.cpa != null);
  const good = tested.filter((r) => (r.cpa as number) <= product.cpaTarget);
  const bad = tested.filter((r) => (r.cpa as number) > product.cpaTarget);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/dashboard/productos" className="text-xs text-muted hover:text-foreground">
          ← Productos
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-3 mt-1">
          <div>
            <h1 className="text-xl font-semibold">{product.name}</h1>
            <p className="text-xs font-mono text-muted">
              {product.code} &middot; CPA objetivo ${product.cpaTarget.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded p-4">
          <p className="text-xs font-mono uppercase tracking-wide text-muted">Realizado</p>
          <p className="text-2xl font-semibold tabular-nums">{done.length}</p>
        </div>
        <div className="bg-surface border border-border rounded p-4">
          <p className="text-xs font-mono uppercase tracking-wide text-muted">Por realizar</p>
          <p className="text-2xl font-semibold tabular-nums">{pending}</p>
        </div>
        <div className="bg-good-bg rounded p-4">
          <p className="text-xs font-mono uppercase tracking-wide text-good">Buen performance</p>
          <p className="text-2xl font-semibold tabular-nums text-good">{good.length}</p>
        </div>
        <div className="bg-critical-bg rounded p-4">
          <p className="text-xs font-mono uppercase tracking-wide text-critical">Bajo performance</p>
          <p className="text-2xl font-semibold tabular-nums text-critical">{bad.length}</p>
        </div>
      </div>

      {tested.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-surface border border-border rounded overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-good-bg">
              <p className="text-xs font-mono uppercase tracking-wide text-good">Buen performance</p>
            </div>
            {good.length === 0 ? (
              <p className="px-4 py-4 text-xs text-muted">Ninguno todavía.</p>
            ) : (
              good.map((r) => (
                <div key={r.id} className="px-4 py-2.5 border-b border-border last:border-b-0 text-sm flex justify-between">
                  <span>{r.adName}</span>
                  <span className="tabular-nums text-good">${r.cpa?.toFixed(2)}</span>
                </div>
              ))
            )}
          </div>
          <div className="bg-surface border border-border rounded overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-critical-bg">
              <p className="text-xs font-mono uppercase tracking-wide text-critical">Bajo performance</p>
            </div>
            {bad.length === 0 ? (
              <p className="px-4 py-4 text-xs text-muted">Ninguno todavía.</p>
            ) : (
              bad.map((r) => (
                <div key={r.id} className="px-4 py-2.5 border-b border-border last:border-b-0 text-sm flex justify-between">
                  <span>{r.adName}</span>
                  <span className="tabular-nums text-critical">${r.cpa?.toFixed(2)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-border">
        <PipelineBoard
          canManage={canManage}
          currentUserId={session.userId}
          currentUserName={session.name}
          initialRequirements={requirements.map((r) => ({
            ...r,
            date: r.date.toISOString(),
            dueDate: r.dueDate ? r.dueDate.toISOString() : null,
          }))}
          products={[{ id: product.id, code: product.code, name: product.name }]}
          users={users}
          title={`Pipeline — ${product.name}`}
          subtitle="Solo los requerimientos de este producto."
        />
      </div>
    </div>
  );
}
