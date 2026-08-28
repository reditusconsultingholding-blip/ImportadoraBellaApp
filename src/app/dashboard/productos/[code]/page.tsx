import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import PipelineBoard from "../../pipeline/pipeline-board";
import TablaCreativos, { type Creativo } from "./tabla-creativos";
import Repositorio from "./repositorio";
import BancoReferencias from "./banco-referencias";
import MatrixRondas from "./matrix-rondas";

const DONE = new Set(["REALIZADO", "EDITADO", "TESTEADO"]);

export default async function ProductoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ vista?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canAccessPipeline(session.role)) redirect("/dashboard");

  const { code } = await params;
  const { vista } = await searchParams;
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
        // El archivo historico queda fuera de la vista activa: son piezas de
        // otra operacion, con productos y editores que ya no existen aqui.
        // Mezclarlas volveria inutilizable la tabla de seguimiento.
        origen: null,
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

  // La planilla que el equipo ya usa, con las columnas en el mismo orden.
  const creativos: Creativo[] = requirements.map((r) => ({
    id: r.id,
    date: r.date ? r.date.toISOString() : null,
    adName: r.adName,
    adType: r.adType,
    phase: r.phase,
    visualFormat: r.visualFormat,
    angle: r.angle,
    awarenessLevel: r.awarenessLevel,
    marketOrigin: r.marketOrigin,
    ownerId: r.ownerId,
    ownerName: r.owner?.name ?? null,
    status: r.status,
    estado: r.estado,
    ronda: r.ronda,
    fbPostLink: r.fbPostLink,
    tiktokPostLink: r.tiktokPostLink,
    originalVideoLink: r.originalVideoLink,
    externalId1: r.externalId1,
    hookRate: r.hookRate,
    ctr: r.ctr,
    holdRate: r.holdRate,
    purchases: r.purchases,
    cpa: r.cpa,
    frequency: r.frequency,
    cpm: r.cpm,
    nextAction: r.nextAction,
    notes: r.notes,
  }));

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

      {/* Tres formas de mirar el mismo producto. La tabla es la planilla que
          el equipo ya usa; el pipeline, las mismas piezas en tarjetas; el
          repositorio, el material del que salen. */}
      <div className="flex flex-wrap gap-1.5 border-t border-border pt-4">
        {[
          { id: "tabla", label: "Seguimiento de creativos" },
          { id: "rondas", label: "Rondas" },
          { id: "referencias", label: "Referencias" },
          { id: "pipeline", label: "Pipeline" },
          { id: "repositorio", label: "Dirección creativa" },
        ].map((v) => {
          const activo = (vista ?? "tabla") === v.id;
          return (
            <Link
              key={v.id}
              href={`/dashboard/productos/${encodeURIComponent(product.code)}?vista=${v.id}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                activo
                  ? "border-accent bg-good-bg text-accent-strong"
                  : "border-border text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              {v.label}
            </Link>
          );
        })}
      </div>

      {vista === "rondas" ? (
        <MatrixRondas productId={product.id} />
      ) : vista === "referencias" ? (
        <BancoReferencias productId={product.id} />
      ) : vista === "repositorio" ? (
        <Repositorio productId={product.id} />
      ) : vista === "pipeline" ? (
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
          subtitle="Las mismas piezas, en tarjetas por etapa."
        />
      ) : (
        <TablaCreativos
          inicial={creativos}
          personas={users.map((u) => ({ id: u.id, name: u.name }))}
          puedeEditar={canManage || requirements.some((r) => r.ownerId === session.userId)}
        />
      )}
    </div>
  );
}
