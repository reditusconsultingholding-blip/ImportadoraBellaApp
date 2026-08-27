import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import ProductBoard, { type BoardItem } from "./product-board";

const DONE = new Set(["REALIZADO", "EDITADO", "TESTEADO"]);

// Camino desde la raíz hasta la carpeta abierta, para las migas de pan.
// Se sube por parentId con un tope de profundidad: si alguna vez quedara un
// ciclo en la base, esto no cuelga la página.
async function breadcrumb(folderId: string | null, organizationId: string) {
  const path: { id: string; name: string }[] = [];
  let cursor = folderId;
  let guard = 0;
  while (cursor && guard++ < 25) {
    const folder = await db.productFolder.findUnique({
      where: { id: cursor },
      select: { id: true, name: true, parentId: true, organizationId: true },
    });
    if (!folder || folder.organizationId !== organizationId) break;
    path.unshift({ id: folder.id, name: folder.name });
    cursor = folder.parentId;
  }
  return path;
}

export default async function ProductosPage({
  searchParams,
}: {
  searchParams: Promise<{ carpeta?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canAccessPipeline(session.role)) redirect("/dashboard");

  const canManage = canManagePipeline(session.role);
  const { carpeta } = await searchParams;

  // Una carpeta de otra organización se trata como inexistente: se abre la raíz.
  let folderId: string | null = null;
  if (carpeta) {
    const found = await db.productFolder.findUnique({
      where: { id: carpeta },
      select: { id: true, organizationId: true },
    });
    if (found && found.organizationId === session.organizationId) folderId = found.id;
  }

  const [folders, products, notes, path] = await Promise.all([
    db.productFolder.findMany({
      where: { organizationId: session.organizationId, parentId: folderId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { children: true, products: true, notes: true } } },
    }),
    db.product.findMany({
      where: { organizationId: session.organizationId, folderId, archived: false },
      orderBy: { createdAt: "asc" },
      include: {
        requirements: {
          where: canManage ? {} : { ownerId: session.userId },
          select: { status: true, cpa: true },
        },
      },
    }),
    db.boardNote.findMany({
      where: { organizationId: session.organizationId, folderId },
      orderBy: { createdAt: "asc" },
    }),
    breadcrumb(folderId, session.organizationId),
  ]);

  const items: BoardItem[] = [
    ...folders.map((f) => ({
      kind: "folder" as const,
      id: f.id,
      x: f.positionX,
      y: f.positionY,
      color: f.color,
      name: f.name,
      counts: {
        folders: f._count.children,
        products: f._count.products,
        notes: f._count.notes,
      },
    })),
    ...products.map((p) => {
      const done = p.requirements.filter((r) => DONE.has(r.status)).length;
      const tested = p.requirements.filter((r) => r.status === "TESTEADO" && r.cpa != null);
      return {
        kind: "product" as const,
        id: p.id,
        x: p.positionX,
        y: p.positionY,
        color: null,
        name: p.name,
        code: p.code,
        cpaTarget: p.cpaTarget,
        salePrice: p.salePrice,
        unitCost: p.unitCost,
        stats: {
          done,
          pending: p.requirements.length - done,
          good: tested.filter((r) => (r.cpa as number) <= p.cpaTarget).length,
          bad: tested.filter((r) => (r.cpa as number) > p.cpaTarget).length,
        },
      };
    }),
    ...notes.map((n) => ({
      kind: "note" as const,
      id: n.id,
      x: n.positionX,
      y: n.positionY,
      color: n.color,
      body: n.body,
    })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-semibold">Productos</h1>
        <p className="text-sm text-muted mt-1">
          El catálogo como un tablero: armá carpetas, meté productos adentro y anotá ideas al lado.
          Arrastrá cualquier tarjeta para acomodarla — la posición queda guardada para todo el equipo.
        </p>
      </div>

      <ProductBoard
        items={items}
        folderId={folderId}
        path={path}
        canManage={canManage}
        parentId={path.length > 1 ? path[path.length - 2].id : null}
      />
    </div>
  );
}
