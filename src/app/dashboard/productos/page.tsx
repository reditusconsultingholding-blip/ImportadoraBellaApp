import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";

export default async function ProductosPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canAccessPipeline(session.role)) redirect("/dashboard");

  const canManage = canManagePipeline(session.role);

  const products = await db.product.findMany({
    where: { organizationId: session.organizationId },
    include: {
      requirements: {
        where: canManage ? {} : { ownerId: session.userId },
        select: { status: true, cpa: true },
      },
    },
    orderBy: { code: "asc" },
  });

  const DONE = new Set(["REALIZADO", "EDITADO", "TESTEADO"]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Productos</h1>
        <p className="text-sm text-muted">
          El pipeline creativo de cada producto — qué se hizo, qué falta y qué performó bien.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((p) => {
          const done = p.requirements.filter((r) => DONE.has(r.status)).length;
          const pending = p.requirements.length - done;
          const good = p.requirements.filter((r) => r.status === "TESTEADO" && r.cpa != null && r.cpa <= p.cpaTarget).length;
          const bad = p.requirements.filter((r) => r.status === "TESTEADO" && r.cpa != null && r.cpa > p.cpaTarget).length;
          return (
            <Link
              key={p.id}
              href={`/dashboard/productos/${p.code}`}
              className="bg-surface border border-border rounded p-5 flex flex-col gap-3 hover:border-accent transition"
            >
              <div>
                <p className="font-semibold">{p.name}</p>
                <p className="text-xs font-mono text-muted">{p.code}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-surface-2 rounded px-2 py-1.5">
                  <p className="text-muted">Realizado</p>
                  <p className="font-semibold tabular-nums">{done}</p>
                </div>
                <div className="bg-surface-2 rounded px-2 py-1.5">
                  <p className="text-muted">Por realizar</p>
                  <p className="font-semibold tabular-nums">{pending}</p>
                </div>
                <div className="bg-good-bg rounded px-2 py-1.5">
                  <p className="text-good">Buen performance</p>
                  <p className="font-semibold tabular-nums text-good">{good}</p>
                </div>
                <div className="bg-critical-bg rounded px-2 py-1.5">
                  <p className="text-critical">Bajo performance</p>
                  <p className="font-semibold tabular-nums text-critical">{bad}</p>
                </div>
              </div>
            </Link>
          );
        })}
        {products.length === 0 && (
          <p className="text-sm text-muted">Todavía no hay productos cargados.</p>
        )}
      </div>
    </div>
  );
}
